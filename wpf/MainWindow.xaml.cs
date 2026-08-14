using System.IO;
// CreateEntryFromFile is an extension on ZipArchive, so qualifying the types is
// not enough: the namespace has to be in scope for the method to resolve.
using System.IO.Compression;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using Microsoft.Web.WebView2.Core;
// For Mutate(). Every ImageSharp TYPE stays fully qualified below, because
// System.Windows brings its own ResizeMode and Size into scope and an unqualified
// one here would be ambiguous rather than wrong-and-obvious.
using SixLabors.ImageSharp.Processing;

namespace JubiLujahStudio;

// A WPF host around a real WebView2 (Edge/Chromium) browser. You log in to
// ChatGPT by hand in the embedded browser — a genuine browser, so Cloudflare's
// human-check passes normally — and the session cookies persist in the app's
// own data folder. The app then drives YOUR authenticated session with injected
// JavaScript to submit each piece's image prompt, waits for the image, and
// writes it back beside the piece.
//
// Ported from InspireManna.com/tools/ArticleImageStudio, which was itself ported
// from an earlier JubiLujah build by way of JubileeVerse. The browser-automation
// half is unchanged. The DATA half is entirely JubiLujah's:
//
//   Images   — core/articles/*.md and core/backstage/{interviews,stories,
//              testimonies}/*.md, imaged into app/web/public/images/
//   Music    — the album corpus on the music drive: lyrics out to Suno, the
//              rendered mp3s back into each album's tracks/ folder
//   Deploy   — deploy/publish.sh, measured first by wpf/deploy-status.mjs
//
// TWO SOURCE SHAPES, and they are not interchangeable. An ARTICLE carries
// `key: value` frontmatter between two `---` fences and records its picture in an
// `image:` field, which core/articles/gen-articles.mjs compiles into
// articles.json. A BACKSTAGE piece has no frontmatter at all: its prompt lives in
// a ```prompt fence and app/web/scripts/gen-backstage.mjs looks its picture up by
// slug on disk. So an article is marked done by a field and a backstage piece is
// marked done by the file existing, and this tool writes each the way its own
// compiler reads it. See ReadArticle and ReadBackstage.
//
// THE AUTHOR IS IN THE PICTURE. Every piece names its writer — `personaSlug` in
// an article, `Artist:` in a backstage fence — and each image carries that person
// inside the scene. The portrait at personas/<Name>.png is attached to the
// ChatGPT turn as a likeness reference and the prompt is extended to place the
// author among the people already described. See AuthorClause for why the
// reference's own clothing and background are explicitly thrown away.
//
// NOTE: nothing here is reviewed automatically. Look at the images before the
// pieces publish, and look hardest at the likeness.
//
// NOTE: this automates the ChatGPT web UI, which may conflict with OpenAI's
// Terms of Use. It runs against your own logged-in session at your direction.
public partial class MainWindow : Window
{
    /// <summary>
    /// How a section stores its picture, which is the only thing that actually
    /// differs between the two source trees.
    /// </summary>
    private enum Kind
    {
        /// core/articles — frontmatter, and an `image:` field to fill in.
        Article,
        /// core/backstage — a ```prompt fence, and a slug-named file on disk.
        Backstage,
        /// An album cover on the music drive. No .md at all: the source is the
        /// album folder, the prompt is BUILT from .models plus the album's own
        /// content, and the record is <CODE>.png landing in artwork/.
        Cover,
    }

    // The four source folders, in tab order. Paths are relative to the repo root
    // and are the live directory names.
    private static readonly (string Key, string Display, string Rel, Kind Kind)[] Sections =
    {
        ("articles",    "Articles",    @"core\articles",              Kind.Article),
        ("interviews",  "Interviews",  @"core\backstage\interviews",  Kind.Backstage),
        ("stories",     "Stories",     @"core\backstage\stories",     Kind.Backstage),
        ("testimonies", "Testimonies", @"core\backstage\testimonies", Kind.Backstage),
    };

    // The album corpus. A separate volume from the repo, which is why it is a
    // setting rather than derived from the repo root.
    private const string DefaultMusicRoot = @"J:\jubilujah.com\music\inspire";

    private string _root = "";          // the repo, resolved by its marker file
    private string _toolDir = "";
    private string _configFile = "";
    private string _userDataFolder = "";
    private string _personasRoot = "";
    private string _musicRoot = DefaultMusicRoot;

    /// <summary>app/web/public — every image this tool writes lands under here.</summary>
    private string WebPublic => Path.Combine(_root, "app", "web", "public");

    // Layout the user dragged to, in device-independent pixels. Restored on
    // launch and written back on close, so the window comes up the way it was
    // left rather than resetting to the designer's guess every time.
    //
    // Kept as plain doubles rather than read off the ColumnDefinition at save
    // time only: a window closed while minimised reports an ActualWidth of 0 for
    // everything, and persisting that would open the next session with the panel
    // and the log collapsed to nothing.
    private double _panelWidth = DefaultPanelWidth;
    private double _logHeight = DefaultLogHeight;

    private const double DefaultPanelWidth = 344;
    private const double DefaultLogHeight = 170;
    private const double MinPanelWidth = 260;
    private const double MinLogHeight = 52;

    // Base64 JPEG of each author portrait, keyed by the file path it came from.
    // A sweep of the whole library sends the same twelve pictures dozens of times
    // each; decoding and re-encoding them once is the difference between a cache
    // hit and one disk read plus one resize per piece.
    private readonly Dictionary<string, string> _referenceCache = new(StringComparer.OrdinalIgnoreCase);

    private bool _ready;
    private bool _running;
    private bool _homeRetried;
    private CancellationTokenSource? _cts;
    private TaskCompletionSource<string>? _imageMsg;

    // Second guard so a run never loops on the same piece even if a write
    // hiccups. The durable record is the piece's own image — a field for an
    // article, the file on disk for a backstage piece.
    private readonly HashSet<string> _completedPaths = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Pieces whose image was rendered in THIS session. Two jobs, and they are
    /// deliberately not the same set as _completedPaths.
    ///
    /// It decides which rows carry the green tick, and it keeps those rows on
    /// screen after they are finished. Without the second part a completed piece
    /// would vanish from the worklist the instant it succeeded, because it now
    /// has an image and the list hides those: the tick would never be seen. So a
    /// finished piece stays, ticked, until Refresh is pressed.
    ///
    /// _completedPaths is never cleared during a run, because it stops a run
    /// looping. This is cleared by Refresh and by Scan, which is what makes the
    /// ticked rows drop out on demand rather than on a timer.
    /// </summary>
    private readonly HashSet<string> _sessionDone = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// One worklist row. The tick is a separate column so it can be coloured on
    /// its own, and the row CARRIES ITS PIECE.
    ///
    /// That last part is not decoration. Selection used to be resolved by taking
    /// the ListBox's index and re-deriving the visible list from the section map
    /// plus the show-all checkbox. Two reads of the same state at two different
    /// moments: if anything changed the checkbox without re-rendering, the two
    /// disagreed and index N pointed at a different piece than the one on screen.
    /// Holding the reference makes that impossible.
    /// </summary>
    private sealed class Row
    {
        public string Mark { get; init; } = "";
        public System.Windows.Media.Brush MarkBrush { get; init; } = System.Windows.Media.Brushes.Transparent;
        public string Title { get; init; } = "";
        public Piece? Piece { get; init; }            // null on a placeholder row
        public Album? Album { get; init; }            // set on a music worklist row
        public Track? Track { get; init; }            // set on a track row
        public override string ToString() => Title;   // keeps log lines readable
    }

    /// <summary>One Styles line, lifted out of a lyrics file for its Copy button.</summary>
    private sealed class StyleRow
    {
        public string Head { get; init; } = "";
        public string Style { get; init; } = "";
    }

    private static readonly System.Windows.Media.Brush TickFresh =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x3D, 0xD5, 0x6D));
    private static readonly System.Windows.Media.Brush TickOld =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x5a, 0x63, 0x74));
    /// The house amber, for a line that has to be read rather than merely seen.
    private static readonly System.Windows.Media.Brush WarnAmber =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0xE6, 0xAC, 0x00));
    private static readonly System.Windows.Media.Brush RowPlain =
        new System.Windows.Media.SolidColorBrush(System.Windows.Media.Color.FromRgb(0x9a, 0xa0, 0xad));

    // Per-section piece lists, keyed by section key.
    private readonly Dictionary<string, List<Piece>> _bySection = new();

    private const string CHATGPT = "https://chatgpt.com/";

    // Appended to every prompt so ChatGPT renders a wide hero image, not a
    // square. The stored prompt already ends with a 16:9 instruction; this
    // restates it as a command, which the web UI honours far more reliably.
    //
    // ONE LINE, deliberately. This used to start with "\n\n" and that was a bug:
    // the composer is a ProseMirror contenteditable, execCommand('insertText')
    // splits on the blank line into separate paragraphs, and only the LAST
    // paragraph survived to be sent. The piece's prompt was silently dropped and
    // ChatGPT received nothing but the aspect-ratio instruction, which is not a
    // request for anything and failed the turn. Never reintroduce a newline here,
    // and see SubmitScript for the guard that now catches it.
    private const string AspectSuffix =
        " IMPORTANT: produce this image in a 16:9 widescreen landscape aspect ratio, " +
        "wide horizontal orientation, not square and not portrait.";

    /// <summary>
    /// The same job for an album cover, which is square rather than wide — and
    /// which must come back with NO lettering on it at all.
    ///
    /// That second half is the load-bearing one. Every cover in the catalogue
    /// carries the house chrome: a border, the persona's name in script up the
    /// left edge, and the album title across the bottom. None of it is generated
    /// here. The app draws it afterwards from the manifest's own title, in
    /// ApplyChrome, because a title a model INVENTED is exactly the failure the
    /// catalogue is already carrying — AMIM1001EN still publishes "BRIDGE ACROSS
    /// FAITHS" over an album renamed months ago, and nothing caught it because
    /// the words are baked into the pixels.
    ///
    /// ONE LINE. See AspectSuffix for why a newline here truncates the prompt.
    /// </summary>
    private const string SquareSuffix =
        " IMPORTANT: produce this image in a 1:1 square aspect ratio, equal width and height, " +
        "not widescreen and not portrait. " +
        "Leave the left third of the frame visually calm and uncluttered, and keep the bottom edge " +
        "free of important detail. " +
        "CRITICAL: the image must contain NO text of any kind — no title, no lettering, no words, " +
        "no signature, no watermark, no logo, no caption and no border. It is a photograph only.";

    public MainWindow()
    {
        InitializeComponent();
        ResolvePaths();
        LoadConfig();
        RepoRoot.Text = _root;
        PersonasRoot.Text = _personasRoot;
        MusicRoot.Text = _musicRoot;
        ApplyLayout();
        FillPersonaPicker();
        FillCoverPersonaPicker();
        _coverUiBuilt = true;   // the covers picker may now trigger a scan
        Loaded += async (_, _) => await InitAsync();
        // Coming back to the window is the moment you would look at the lyrics
        // again, and the moment a batch running elsewhere is most likely to have
        // rewritten them while you were away.
        Activated += (_, _) => ReloadLyricsIfChanged();
        Closing += (_, _) => SaveLayout();
    }

    // ---- the rail ----------------------------------------------------------
    // Four views share one panel. The rail's RadioButtons are mutually exclusive
    // by GroupName, so this only has to answer "which one is on" rather than
    // track state of its own.
    //
    // Fires DURING InitializeComponent, because RailImages carries
    // IsChecked="True" in the markup and BAML sets that property while the window
    // is still being built.
    //
    // Which is why identity comes from `sender` and not from RailImages. The
    // generated field for a named element is assigned by Connect(), and for the
    // element currently being initialised that has not happened yet: reading
    // RailImages.IsChecked here threw a NullReferenceException on every launch,
    // inside InitializeComponent, so the app died before showing a window. The
    // view fields are safe to test because the rail is declared last in the XAML
    // and they are therefore already built, but sender is safe unconditionally.
    private void Rail_Checked(object sender, RoutedEventArgs e)
    {
        if (ViewImages == null || ViewMusic == null || ViewSettings == null
            || ViewDeploy == null || ViewCovers == null || PanelTitle == null) return;

        var which = (sender as FrameworkElement)?.Name ?? "";
        var images = which == "RailImages";
        var music = which == "RailMusic";
        var deploy = which == "RailDeploy";
        var covers = which == "RailCovers";

        ViewImages.Visibility = images ? Visibility.Visible : Visibility.Collapsed;
        ViewMusic.Visibility = music ? Visibility.Visible : Visibility.Collapsed;
        ViewDeploy.Visibility = deploy ? Visibility.Visible : Visibility.Collapsed;
        ViewCovers.Visibility = covers ? Visibility.Visible : Visibility.Collapsed;
        ViewSettings.Visibility = (!images && !music && !deploy && !covers) ? Visibility.Visible : Visibility.Collapsed;

        PanelTitle.Text = images ? "Article Images" : music ? "Album Music"
                        : deploy ? "Deploy" : covers ? "Cover Images" : "Settings";

        // The left pane belongs to whichever view is driving: the ChatGPT browser
        // for images and settings, the lyrics reader for music, the live site for
        // deploy. Each is collapsed rather than covered, because a WebView2 draws
        // over WPF content in some compositing paths no matter where it sits in
        // the z-order, and two of these three are WebView2s.
        if (LyricsPane != null && Wv != null && SitePane != null)
        {
            LyricsPane.Visibility = music ? Visibility.Visible : Visibility.Collapsed;
            SitePane.Visibility = deploy ? Visibility.Visible : Visibility.Collapsed;
            // Images, Covers and Settings all sit in front of the ChatGPT browser —
            // the two generating views because they drive it, Settings because the
            // login lives there.
            Wv.Visibility = (!music && !deploy) ? Visibility.Visible : Visibility.Collapsed;
        }

        // These read from disk and from the VPS, so they are refreshed on arrival
        // rather than left showing whatever was true last time.
        if (music) _ = RefreshAlbumsAsync();
        if (deploy) { _ = ShowSiteAsync(); _ = RefreshDeployAsync(); }
        // Scanned on first arrival, not on launch: it walks the whole music drive,
        // and a session that never opens this view should not pay for it. Not
        // gated on _ready — the scan reads folders, not the browser.
        if (covers && _coverUiBuilt && _covers.Count == 0) ScanCovers();
    }

    // ========================================================================
    //  ALBUM MUSIC
    // ========================================================================
    //
    // The workflow the album lyrics were always heading toward: read them here,
    // render the audio in Suno, drop the results back into the album's tracks/
    // folder. The songs themselves are not written here — that is the blueprint
    // and lyrics pipeline in setup/generatelyrics-jubilujah.md. This view reads
    // them out and files the audio back.

    /// <summary>One album folder under a voice.</summary>
    private sealed class Album
    {
        public string Dir = "";           // absolute path to the album folder
        public string Code = "";          // AMIM1002EN, off the folder name
        public string Title = "";         // album_title from album.meta.json, else the folder
        public string Voice = "";         // amir-inspire
        public string LyricsFile = "";    // absolute path, or "" when there is none
        public List<Track> Tracks = new();
        public int Orphans;               // mp3s in tracks/ that no current song title claims
        public int Rendered => Tracks.Count(t => t.HasFile);
        public override string ToString() => Title;
    }

    /// <summary>One song of an album, off the lyrics file's SONG TITLE lines.</summary>
    private sealed class Track
    {
        public string Name = "";          // "01 The Grove Breaks Into Singing"
        public string Style = "";         // its Styles: line, for Suno
        public string File = "";          // where its mp3 belongs, existing or not
        public bool HasFile;
        public override string ToString() => Name;
    }

    private readonly List<Album> _albums = new();

    /// <summary>
    /// Bumped on every scan so a slow one that is no longer wanted cannot land.
    ///
    /// Reading a voice means opening every album's meta and lyrics file on the
    /// music drive, which is slow enough that two clicks can overlap: pick
    /// Jubilee, change your mind, pick Zev, and without this the Jubilee scan
    /// finishes last and fills the list with the wrong voice's albums.
    /// </summary>
    private int _albumScan;

    private void BtnMusicRefresh_Click(object sender, RoutedEventArgs e) { ReadRootFromUi(); _ = RefreshAlbumsAsync(); }

    /// <summary>
    /// The voices, straight off the music root: every folder that is not a backup
    /// or a scratch directory. Read from disk rather than hard-coded, because
    /// the corpus grows a voice — kingdom-pulse, radiant-stones — without anyone
    /// remembering to come back and edit a list in here.
    /// </summary>
    private List<string> VoiceFolders()
    {
        if (!Directory.Exists(_musicRoot)) return new();
        return Directory.EnumerateDirectories(_musicRoot)
            .Select(Path.GetFileName)
            .Where(n => !string.IsNullOrEmpty(n) && !n!.StartsWith('_') && !n.StartsWith('.'))
            .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            .Select(n => n!)
            .ToList();
    }

    /// <summary>"amir-inspire" reads as "Amir Inspire" in the picker.</summary>
    private static string VoiceDisplay(string folder) =>
        string.Join(' ', folder.Split('-', StringSplitOptions.RemoveEmptyEntries)
                               .Select(w => w.Length == 0 ? w : char.ToUpperInvariant(w[0]) + w[1..]));

    private void FillPersonaPicker()
    {
        CmbPersona.Items.Clear();
        foreach (var v in VoiceFolders())
            CmbPersona.Items.Add(new ComboBoxItem { Content = VoiceDisplay(v), Tag = v });
        if (CmbPersona.Items.Count > 0) CmbPersona.SelectedIndex = 0;
    }

    private string SelectedVoice() => (CmbPersona?.SelectedItem as ComboBoxItem)?.Tag as string ?? "";

    private void CmbPersona_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // Fires while the window is still being built, because FillPersonaPicker
        // sets SelectedIndex in the constructor. Scanning a voice means reading
        // every album folder on the music drive, so doing it there would hold the
        // window closed behind a disk walk the user did not ask for; the rail does
        // it on arrival at the view instead.
        if (LstAlbums == null || !_ready) return;
        _ = RefreshAlbumsAsync();
    }

    /// <summary>
    /// The album worklist for the selected voice, with the state of each read off
    /// the drive rather than off any field that could claim a rendering nobody
    /// made.
    ///
    ///     ✓  every song has its mp3      ◑  some do      (blank)  none do
    ///     !  mp3s are present that no current song title claims
    ///
    /// That last mark is the publish gate, and it earns its place in the list
    /// rather than in a footnote. When an album's lyrics are rewritten, the audio
    /// already in tracks/ was rendered from the OLD words: the folder still looks
    /// full, the count still reads twelve, and shipping it puts pre-rewrite songs
    /// on the site under the new titles. A filename that no current SONG TITLE
    /// claims is the mechanical trace of exactly that.
    /// </summary>
    private async Task RefreshAlbumsAsync()
    {
        var keepIndex = LstAlbums.SelectedIndex;

        if (!Directory.Exists(_musicRoot))
        {
            _albums.Clear();
            LstAlbums.Items.Clear();
            LstTracks.Items.Clear();
            MusicSummary.Text = "Music root not found: " + _musicRoot;
            MusicSummary.Foreground = WarnAmber;
            return;
        }

        var voice = SelectedVoice();
        if (voice.Length == 0) { MusicSummary.Text = "No voice folders under " + _musicRoot; return; }

        var voiceDir = Path.Combine(_musicRoot, voice);
        if (!Directory.Exists(voiceDir)) { MusicSummary.Text = "Not found: " + voiceDir; return; }

        // OFF THE UI THREAD, and this is not a micro-optimisation.
        //
        // Reading a voice opens every album's meta file and its whole lyrics
        // file. Measured on the music drive: 2-4 seconds for a small voice and
        // 8.2 for Jubilee's 148 albums, cold. Done inline that is the window
        // locked solid every time the Music view is opened or the voice is
        // changed — long enough to look like a crash.
        var mine = ++_albumScan;
        BtnMusicRefresh.IsEnabled = false;
        MusicSummary.Foreground = RowPlain;
        MusicSummary.Text = $"reading {VoiceDisplay(voice)}…";

        List<Album> found;
        try
        {
            found = await Task.Run(() => ScanVoice(voiceDir, voice));
        }
        catch (Exception ex)
        {
            if (mine == _albumScan)
            {
                MusicSummary.Text = "Could not read " + voiceDir + ": " + ex.Message;
                MusicSummary.Foreground = WarnAmber;
                BtnMusicRefresh.IsEnabled = true;
            }
            return;
        }

        // A newer scan started while this one was reading: its answer wins.
        if (mine != _albumScan) return;
        BtnMusicRefresh.IsEnabled = true;

        _albums.Clear();
        _albums.AddRange(found);
        LstAlbums.Items.Clear();
        LstTracks.Items.Clear();

        int done = 0, part = 0, none = 0, noLyrics = 0, flagged = 0;
        foreach (var album in _albums)
        {
            if (album.LyricsFile.Length == 0) noLyrics++;
            if (album.Orphans > 0) flagged++;

            string mark;
            System.Windows.Media.Brush brush;
            if (album.Orphans > 0) { mark = "!"; brush = WarnAmber; }
            else if (album.Tracks.Count > 0 && album.Rendered == album.Tracks.Count) { mark = "✓"; brush = TickFresh; done++; }
            else if (album.Rendered > 0) { mark = "◑"; brush = TickOld; part++; }
            else { mark = ""; brush = TickOld; none++; }

            LstAlbums.Items.Add(new Row { Mark = mark, MarkBrush = brush, Title = album.Title, Album = album });
        }

        MusicSummary.Text = $"{done}/{_albums.Count} rendered"
                          + (part > 0 ? $" · {part} part" : "")
                          + (none > 0 ? $" · {none} none" : "")
                          + (flagged > 0 ? $" · {flagged} FLAGGED" : "")
                          + (noLyrics > 0 ? $" · {noLyrics} with no lyrics file" : "");

        // Green reads as "nothing to do here", and it must not while a voice is
        // still carrying audio that its own lyrics no longer name.
        MusicSummary.Foreground = flagged > 0 || noLyrics > 0 ? WarnAmber : TickFresh;

        if (_albums.Count == 0)
            LstAlbums.Items.Add(new Row { MarkBrush = RowPlain, Title = "(no albums for this voice)" });
        else if (keepIndex >= 0 && keepIndex < LstAlbums.Items.Count)
            LstAlbums.SelectedIndex = keepIndex;   // a drop should not lose your place
    }

    /// <summary>
    /// Every album of one voice, read from disk. Pure and static so it can run on
    /// a worker thread and be exercised on its own.
    /// </summary>
    private static List<Album> ScanVoice(string voiceDir, string voice)
    {
        var list = new List<Album>();
        foreach (var dir in Directory.EnumerateDirectories(voiceDir).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
        {
            var name = Path.GetFileName(dir);
            if (name.StartsWith('_') || name.StartsWith('.')) continue;
            list.Add(ReadAlbum(dir, voice));
        }
        return list;
    }

    /// <summary>
    /// Read one album folder: its title, its lyrics file, its songs, and which of
    /// them have audio.
    ///
    /// The SONG TITLE lines are the track list, not the folder. An album whose
    /// audio has not been rendered yet has an empty tracks/ folder and twelve
    /// songs, and listing the folder would show it as having nothing to do.
    /// </summary>
    private static Album ReadAlbum(string dir, string voice)
    {
        var folder = Path.GetFileName(dir);
        var album = new Album
        {
            Dir = dir,
            Voice = voice,
            Code = folder.Split('-', 2)[0],
            Title = folder,
        };

        // The meta file names the album properly. It is a nicety, not a source of
        // truth: a folder with no meta still lists under its own name.
        try
        {
            var meta = Path.Combine(dir, "album.meta.json");
            if (File.Exists(meta))
            {
                var t = JsonNode.Parse(File.ReadAllText(meta))?["album_title"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(t)) album.Title = $"{album.Code} · {t}";
            }
        }
        catch { /* the folder name is a perfectly good label */ }

        // lyrics/<Artist>-<Album>-lyrics.md. blueprint.md sits beside it and is
        // the album's architecture, not its words.
        var lyricsDir = Path.Combine(dir, "lyrics");
        if (Directory.Exists(lyricsDir))
        {
            album.LyricsFile = Directory.EnumerateFiles(lyricsDir, "*.md")
                .Where(f => !Path.GetFileName(f).Equals("blueprint.md", StringComparison.OrdinalIgnoreCase))
                .OrderByDescending(f => Path.GetFileName(f).Contains("-lyrics", StringComparison.OrdinalIgnoreCase))
                .ThenBy(f => f, StringComparer.OrdinalIgnoreCase)
                .FirstOrDefault() ?? "";
        }

        var tracksDir = Path.Combine(dir, "tracks");
        album.Tracks = ReadTracks(album.LyricsFile, tracksDir);

        // Every mp3 in tracks/ that no current song title claims. See the note on
        // RefreshAlbums for why this is the number that matters most.
        if (Directory.Exists(tracksDir))
        {
            var claimed = new HashSet<string>(
                album.Tracks.Select(t => Path.GetFileNameWithoutExtension(t.File)),
                StringComparer.OrdinalIgnoreCase);
            album.Orphans = Directory.EnumerateFiles(tracksDir, "*.mp3")
                .Count(f => !claimed.Contains(Path.GetFileNameWithoutExtension(f)));
        }

        return album;
    }

    /// <summary>
    /// The songs of one album, paired with their Suno style lines, read off the
    /// lyrics file in the order they appear.
    ///
    /// The canonical single-file format puts one `SONG TITLE:` per song and one
    /// `Styles:` line inside each song's block, so a style is attributed to the
    /// most recent title rather than by position in a flat list — a song missing
    /// its Styles line would otherwise shift every style after it onto the wrong
    /// track, silently.
    /// </summary>
    private static List<Track> ReadTracks(string lyricsFile, string tracksDir)
    {
        var tracks = new List<Track>();
        if (lyricsFile.Length == 0 || !File.Exists(lyricsFile)) return tracks;

        string text;
        try { text = File.ReadAllText(lyricsFile); } catch { return tracks; }

        Track? current = null;
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.TrimEnd('\r');
            var title = Regex.Match(line, @"^SONG TITLE:\s*(.+?)\s*$");
            if (title.Success)
            {
                current = new Track { Name = title.Groups[1].Value };
                current.File = Path.Combine(tracksDir, SafeName(current.Name) + ".mp3");
                current.HasFile = File.Exists(current.File);
                tracks.Add(current);
                continue;
            }
            var style = Regex.Match(line, @"^Styles:\s*(.+?)\s*$");
            if (style.Success && current != null && current.Style.Length == 0)
                current.Style = style.Groups[1].Value;
        }
        return tracks;
    }

    /// <summary>
    /// Song titles are prose: they carry colons, question marks and apostrophes,
    /// none of which a Windows filename may hold. Strips those, collapses the
    /// whitespace they leave, and keeps everything else, because the point of the
    /// convention is that a human can read the filename.
    /// </summary>
    private static string SafeName(string s)
    {
        var cleaned = new string(s.Where(c => !Path.GetInvalidFileNameChars().Contains(c)).ToArray());
        return Regex.Replace(cleaned, @"\s+", " ").Trim().Trim('.');
    }

    /// Straight off the row, for the same reason the image preview does it that
    /// way: an index into a separately rebuilt list is a second source of truth.
    private Album? SelectedAlbum() => (LstAlbums.SelectedItem as Row)?.Album;
    private Track? SelectedTrack() => (LstTracks.SelectedItem as Row)?.Track;

    private void LstAlbums_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var a = SelectedAlbum();
        if (a == null)
        {
            LyricsTitle.Text = "Pick an album on the right";
            LyricsPath.Text = "Its lyrics file opens here, ready to copy into Suno.";
            LyricsText.Text = "";
            StyleRows.ItemsSource = null;
            LyricsFlag.Visibility = Visibility.Collapsed;
            _lyricsOpen = "";
            LstTracks.Items.Clear();
            TrackHead.Text = "Tracks";
            SetDropLabels(null);
            return;
        }

        ShowLyrics(a);
        RenderTracks(a);
    }

    /// <summary>Put one album's lyrics file in the reader, exactly as written.</summary>
    private void ShowLyrics(Album a)
    {
        var here = a.LyricsFile.Length > 0 && File.Exists(a.LyricsFile);

        LyricsTitle.Text = a.Title;
        LyricsPath.Text = here
            ? $"{VoiceDisplay(a.Voice)} · {Path.GetFileName(a.LyricsFile)}"
            : $"{VoiceDisplay(a.Voice)} · no lyrics file in {Path.GetFileName(a.Dir)}\\lyrics";

        try
        {
            LyricsText.Text = here
                ? File.ReadAllText(a.LyricsFile)
                : $"No lyrics file under:\n{Path.Combine(a.Dir, "lyrics")}\n\n"
                  + "Lyrics are authored by the blueprint and lyrics engines, not here. "
                  + "See setup/generatelyrics-jubilujah.md.";
        }
        catch (Exception ex) { LyricsText.Text = "Could not read the lyrics file: " + ex.Message; }

        // Remember what was loaded and when, so a rewrite underneath us is
        // something the window can notice rather than something you find out
        // about by pasting an old lyric into Suno.
        _lyricsOpen = here ? a.LyricsFile : "";
        _lyricsStamp = here ? File.GetLastWriteTimeUtc(a.LyricsFile) : DateTime.MinValue;

        StyleRows.ItemsSource = a.Tracks
            .Select(t => new StyleRow
            {
                Head = t.Name,
                Style = t.Style.Length > 0 ? t.Style : "(no Styles line for this song)",
            })
            .ToList();

        // The publish gate, said out loud. See RefreshAlbums.
        LyricsFlag.Visibility = a.Orphans > 0 ? Visibility.Visible : Visibility.Collapsed;
        LyricsFlagText.Text = a.Orphans == 0 ? "" :
            $"HOLD: {a.Orphans} mp3 file(s) in this album's tracks/ folder carry names that no current SONG TITLE "
            + "claims. That is what a pre-rewrite render looks like — the audio was made from the previous words. "
            + "Do not publish these to the CDN; re-render them from the lyrics below first.";
    }

    /// <summary>The album's songs, each marked by whether its mp3 is on disk.</summary>
    private void RenderTracks(Album a)
    {
        LstTracks.Items.Clear();
        foreach (var t in a.Tracks)
        {
            t.HasFile = File.Exists(t.File);
            LstTracks.Items.Add(new Row
            {
                Mark = t.HasFile ? "✓" : "",
                MarkBrush = t.HasFile ? TickFresh : TickOld,
                Title = t.Name,
                Track = t,
                Album = a,
            });
        }
        if (a.Tracks.Count == 0)
            LstTracks.Items.Add(new Row { MarkBrush = RowPlain, Title = "(no SONG TITLE lines in this album's lyrics)" });

        TrackHead.Text = $"Tracks — {a.Rendered}/{a.Tracks.Count} rendered"
                       + (a.Orphans > 0 ? $" · {a.Orphans} unclaimed mp3 in tracks/" : "");

        if (LstTracks.Items.Count > 0) LstTracks.SelectedIndex = 0;
        SetDropLabels(SelectedTrack());
    }

    private void LstTracks_SelectionChanged(object sender, SelectionChangedEventArgs e) => SetDropLabels(SelectedTrack());

    // ---- the lyrics reader --------------------------------------------------

    private DateTime _lyricsStamp = DateTime.MinValue;
    private string _lyricsOpen = "";

    /// <summary>
    /// Re-read the open lyrics file if it changed on disk since it was loaded.
    ///
    /// Lyrics are rewritten by work running outside this window, so the file under
    /// the reader can be replaced while you are looking at it. Without this the
    /// panel keeps showing the old text until something happens to change the
    /// selection, which reads as "the new lyrics did not come through".
    /// </summary>
    private void ReloadLyricsIfChanged()
    {
        if (_lyricsOpen.Length == 0 || !File.Exists(_lyricsOpen)) return;
        if (File.GetLastWriteTimeUtc(_lyricsOpen) == _lyricsStamp) return;

        var a = SelectedAlbum();
        if (a == null) return;
        Log("The lyrics file changed on disk, reloading it: " + Path.GetFileName(_lyricsOpen));
        // Re-read the album too: a rewrite is exactly what turns the audio already
        // in tracks/ into a pre-rewrite render, and the flag has to follow.
        var fresh = ReadAlbum(a.Dir, a.Voice);
        a.LyricsFile = fresh.LyricsFile;
        a.Tracks = fresh.Tracks;
        a.Orphans = fresh.Orphans;
        ShowLyrics(a);
        RenderTracks(a);
    }

    private void BtnCopyStyle_Click(object sender, RoutedEventArgs e)
    {
        var s = (sender as FrameworkElement)?.Tag as string ?? "";
        if (s.Length == 0 || s.StartsWith('(')) { Log("No Styles line to copy for that song."); return; }
        try { Clipboard.SetText(s); Log("Styles line copied, ready for Suno."); }
        catch (Exception ex) { Log("Clipboard refused the copy: " + ex.Message); }
    }

    private void BtnCopyLyrics_Click(object sender, RoutedEventArgs e)
    {
        if (LyricsText.Text.Length == 0) { Log("Nothing to copy: pick an album first."); return; }
        try { Clipboard.SetText(LyricsText.Text); Log("Lyrics copied to the clipboard."); }
        catch (Exception ex) { Log("Clipboard refused the copy: " + ex.Message); }
    }

    /// <summary>
    /// Every lyrics file for the selected voice, in one zip, one folder per album.
    ///
    /// Scoped to a voice rather than the whole corpus on purpose: a voice is what
    /// gets scored in one sitting, in one musical language, and the corpus is
    /// hundreds of albums. For generating the songs somewhere the music drive is
    /// not mounted.
    /// </summary>
    private void BtnExportZip_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        var voice = SelectedVoice();
        if (voice.Length == 0) { Log("Pick a voice first."); return; }
        if (_albums.Count == 0) { Log("Nothing listed for " + VoiceDisplay(voice) + " — press Refresh."); return; }

        var dlg = new Microsoft.Win32.SaveFileDialog
        {
            FileName = $"{voice}-lyrics-{DateTime.Now:yyyy-MM-dd}.zip",
            DefaultExt = ".zip",
            Filter = "Zip archive (*.zip)|*.zip",
        };
        if (dlg.ShowDialog() != true) return;

        try
        {
            if (File.Exists(dlg.FileName)) File.Delete(dlg.FileName);
            int n = 0, missing = 0;

            using (var zip = System.IO.Compression.ZipFile.Open(
                       dlg.FileName, System.IO.Compression.ZipArchiveMode.Create))
            {
                foreach (var a in _albums)
                {
                    if (a.LyricsFile.Length == 0 || !File.Exists(a.LyricsFile)) { missing++; continue; }
                    zip.CreateEntryFromFile(a.LyricsFile, $"{Path.GetFileName(a.Dir)}/{Path.GetFileName(a.LyricsFile)}");
                    n++;
                }
            }

            Log($"Exported {n} lyrics file(s) for {VoiceDisplay(voice)}, one folder per album.");
            if (missing > 0) Log($"  {missing} album(s) had no lyrics file on disk and were skipped.");
            Log($"  {dlg.FileName}");
        }
        catch (Exception ex) { Log("Export failed: " + ex.Message); }
    }

    // ---- the drop zone and playback -----------------------------------------
    //
    // The filename a dropped file is saved under is DERIVED from the track you
    // picked, so nothing about the drop itself proves the right take landed in
    // the right slot. Hearing it does. That is the entire purpose of the play
    // button on the zone.

    private void SetDropLabels(Track? t)
    {
        if (t == null)
        {
            Drop1Label.Text = "No track selected";
            Drop1Hint.Text = "pick an album and a track first";
            SyncPlayButton(null);
            return;
        }

        Drop1Label.Text = t.Name;
        Drop1Hint.Text = t.HasFile
            ? "done: " + Path.GetFileName(t.File)
            : "drop the mp3 here, saved as " + Path.GetFileName(t.File);
        SyncPlayButton(t);
    }

    private System.Windows.Media.MediaPlayer? _player;
    private string _playingFile = "";
    private bool _playing;

    // Numeric codepoints, not pasted literals: these are private-use characters
    // and a literal does not survive every encoding this file passes through.
    private static readonly string GlyphPlay = char.ConvertFromUtf32(0xE768); // Segoe MDL2 Play
    private static readonly string GlyphStop = char.ConvertFromUtf32(0xE71A); // Segoe MDL2 Stop

    /// <summary>Show a transport only where there is actually a file to play.</summary>
    private void SyncPlayButton(Track? t)
    {
        var here = t != null && File.Exists(t.File);
        BtnPlay1.Visibility = here ? Visibility.Visible : Visibility.Collapsed;
        if (!here) StopPlayback();
        UpdatePlayGlyph();
    }

    private void UpdatePlayGlyph()
    {
        var t = SelectedTrack();
        var sounding = _playing && t != null &&
                       string.Equals(_playingFile, t.File, StringComparison.OrdinalIgnoreCase);
        BtnPlay1.Content = sounding ? GlyphStop : GlyphPlay;
    }

    private void StopPlayback()
    {
        if (_player == null) return;
        try { _player.Stop(); _player.Close(); } catch { }
        _playing = false;
        _playingFile = "";
    }

    private void BtnPlay1_Click(object sender, RoutedEventArgs e)
    {
        var t = SelectedTrack();
        if (t == null) { Log("Select a track first."); return; }

        // Pressing the button that is already sounding stops it. Pressing it on a
        // different track switches, rather than layering two songs at once.
        if (_playing && string.Equals(_playingFile, t.File, StringComparison.OrdinalIgnoreCase))
        {
            StopPlayback();
            UpdatePlayGlyph();
            return;
        }
        StopPlayback();

        if (!File.Exists(t.File)) { Log("No file on disk for that track yet."); UpdatePlayGlyph(); return; }

        try
        {
            _player ??= new System.Windows.Media.MediaPlayer();
            _player.MediaEnded -= OnMediaEnded;
            _player.MediaEnded += OnMediaEnded;
            _player.MediaFailed -= OnMediaFailed;
            _player.MediaFailed += OnMediaFailed;
            _player.Open(new Uri(t.File));
            _player.Play();
            _playing = true;
            _playingFile = t.File;
            UpdatePlayGlyph();
            Log("Playing " + Path.GetFileName(t.File));
        }
        catch (Exception ex)
        {
            // WPF's MediaPlayer leans on the platform codecs. If they are not
            // there, hand the file to whatever the machine does use rather than
            // leaving the user with a dead button.
            Log("Inline playback failed (" + ex.Message + "). Opening it externally.");
            try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(t.File) { UseShellExecute = true }); }
            catch (Exception ex2) { Log("That failed too: " + ex2.Message); }
        }
    }

    private void OnMediaEnded(object? sender, EventArgs e)
    {
        StopPlayback();
        Dispatcher.Invoke(UpdatePlayGlyph);
    }

    private void OnMediaFailed(object? sender, System.Windows.Media.ExceptionEventArgs e)
    {
        _playing = false;
        _playingFile = "";
        Dispatcher.Invoke(UpdatePlayGlyph);
        Log("Could not play that file: " + e.ErrorException?.Message);
    }

    private static string[] Mp3Drop(DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return Array.Empty<string>();
        var files = e.Data.GetData(DataFormats.FileDrop) as string[];
        return files?.Where(f => f.EndsWith(".mp3", StringComparison.OrdinalIgnoreCase))
                     .OrderBy(f => f, StringComparer.OrdinalIgnoreCase)
                     .ToArray() ?? Array.Empty<string>();
    }

    private void Drop_DragOver(object sender, DragEventArgs e)
    {
        var ok = Mp3Drop(e).Length > 0 && SelectedTrack() != null;
        e.Effects = ok ? DragDropEffects.Copy : DragDropEffects.None;
        e.Handled = true;
        if (sender is Border b) b.BorderBrush = new System.Windows.Media.SolidColorBrush(
            ok ? System.Windows.Media.Color.FromRgb(0xE6, 0xAC, 0x00)
               : System.Windows.Media.Color.FromRgb(0xB4, 0x3A, 0x3A));
    }

    private void Drop_DragLeave(object sender, DragEventArgs e) => ResetDropBorder(sender);

    private static void ResetDropBorder(object sender)
    {
        if (sender is Border b)
            b.BorderBrush = new System.Windows.Media.SolidColorBrush(
                System.Windows.Media.Color.FromRgb(0x2c, 0x30, 0x40));
    }

    /// <summary>
    /// File dropped mp3s into the album's tracks/ folder, starting at the
    /// selected track and filling consecutive songs in the order they were
    /// dropped.
    ///
    /// COPY, not move. The source is whatever was dragged out of a downloads
    /// folder or a Suno export, and silently deleting it because it landed on the
    /// wrong track is not a mistake worth making. Overwrites are confirmed one at
    /// a time rather than assumed, because a drop onto a filled slot is more often
    /// the wrong slot than a deliberate re-render.
    /// </summary>
    private void Drop1_Drop(object sender, DragEventArgs e)
    {
        ResetDropBorder(sender);
        e.Handled = true;

        var album = SelectedAlbum();
        var start = SelectedTrack();
        if (album == null || start == null) { Log("Select an album and a track before dropping a song."); return; }

        var files = Mp3Drop(e);
        if (files.Length == 0) { Log("That is not an .mp3."); return; }

        var from = album.Tracks.IndexOf(start);
        if (from < 0) from = 0;

        int filed = 0;
        for (int i = 0; i < files.Length; i++)
        {
            var idx = from + i;
            if (idx >= album.Tracks.Count)
            {
                Log($"  {files.Length - i} file(s) had no track left to fill — the album has {album.Tracks.Count} songs.");
                break;
            }
            var track = album.Tracks[idx];
            if (FileOne(files[i], track)) filed++;
        }

        if (filed > 0)
        {
            var fresh = ReadAlbum(album.Dir, album.Voice);
            album.Tracks = fresh.Tracks;
            album.Orphans = fresh.Orphans;
            RenderTracks(album);
            if (album.Rendered == album.Tracks.Count && album.Tracks.Count > 0)
                Log($"  ✓ {album.Title} now has every song rendered.");
            _ = RefreshAlbumsAsync();
        }
    }

    private bool FileOne(string src, Track track)
    {
        try
        {
            if (File.Exists(track.File))
            {
                var ask = MessageBox.Show(
                    $"{Path.GetFileName(track.File)} already exists.\n\nReplace it?",
                    "JubiLujah Studio", MessageBoxButton.YesNo, MessageBoxImage.Question);
                if (ask != MessageBoxResult.Yes) { Log("Kept the existing " + Path.GetFileName(track.File)); return false; }
            }

            Directory.CreateDirectory(Path.GetDirectoryName(track.File)!);
            File.Copy(src, track.File, overwrite: true);
            Log($"Filed: {Path.GetFileName(src)}  ->  tracks/{Path.GetFileName(track.File)}");
            return true;
        }
        catch (Exception ex) { Log("Could not file that mp3: " + ex.Message); return false; }
    }

    /// <summary>Open the selected album's folder in Explorer.</summary>
    private void BtnMusicOpen_Click(object sender, RoutedEventArgs e)
    {
        var dir = SelectedAlbum()?.Dir;
        if (string.IsNullOrEmpty(dir)) { Log("Select an album first."); return; }
        try
        {
            System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(dir) { UseShellExecute = true });
            Log("Opened " + dir);
        }
        catch (Exception ex) { Log("Could not open " + dir + ": " + ex.Message); }
    }

    // ========================================================================
    //  THE IMAGE PREVIEW
    // ========================================================================

    /// <summary>
    /// The piece the selected row IS, straight off the row. No index maths and no
    /// second derivation of the visible list, so what the preview shows and what
    /// the list shows cannot disagree.
    /// </summary>
    private Piece? SelectedPiece() => (ListFor(SelectedKey()).SelectedItem as Row)?.Piece;

    private void ArticleList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // Only the list that is actually on screen drives the preview. Rendering
        // a worklist clears and refills it, which fires SelectionChanged on every
        // hidden tab too, and each of those would otherwise blank the preview the
        // user is looking at.
        if (!ReferenceEquals(sender, ListFor(SelectedKey()))) return;
        ShowPreview(SelectedPiece());
    }

    /// <summary>
    /// Put the selected piece's rendered image in the preview.
    ///
    /// Loaded through a MemoryStream that is disposed immediately, which matters
    /// more here than it looks: leaving a handle open on the images folder would
    /// make the next render of the same piece fail on a locked file, and it would
    /// fail at the moment of saving, after the turn had already been spent.
    /// </summary>
    private void ShowPreview(Piece? p)
    {
        PreviewImage.Source = null;

        if (p == null)
        {
            PreviewEmpty.Text = "Select a piece to preview its image";
            PreviewCaption.Text = "";
            return;
        }

        PreviewCaption.Text = p.Title;

        if (!p.HasImage)
        {
            PreviewEmpty.Text = "No image yet";
            return;
        }

        var file = Path.Combine(ImagesDirFor(p.Kind), p.ImageFile);
        if (!File.Exists(file))
        {
            // The article names a file that is not there. Worth saying out loud
            // rather than showing an empty box: it means the piece is marked done
            // and will never be queued again.
            PreviewEmpty.Text = "the image field names a file that is not on disk";
            PreviewCaption.Text = $"{p.Title}  ({p.ImageFile})";
            return;
        }

        try
        {
            var (bmp, w, h) = LoadPreview(file);
            PreviewImage.Source = bmp;
            PreviewEmpty.Text = "";
            PreviewCaption.Text = $"{p.Title}   ({w}x{h})";
        }
        catch (Exception ex)
        {
            PreviewEmpty.Text = "Could not read the image";
            PreviewCaption.Text = ex.Message;
        }
    }

    /// <summary>
    /// Decode a piece's image for the preview, and return its true dimensions.
    ///
    /// DECODED THROUGH IMAGESHARP, NOT WPF. These images are WebP, and WPF's
    /// BitmapImage cannot read WebP on this machine: WIC has no registered decoder
    /// for it, so EndInit throws ArgumentNullException "Key cannot be null" from
    /// the codec lookup, which is an unhelpfully generic way of saying "no codec".
    /// ImageSharp is already a dependency here, and is what wrote these files in
    /// the first place, so it is guaranteed to read them.
    ///
    /// Downscaled on the way through. The panel is a few hundred pixels wide and
    /// the source is 1024 or more; decoding full size for every click would hold
    /// far more memory than the preview can ever show.
    ///
    /// The intermediate is PNG because that is a format WPF certainly does read.
    /// </summary>
    private static (System.Windows.Media.Imaging.BitmapImage Image, int Width, int Height) LoadPreview(string file)
    {
        using var src = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(file));
        var trueW = src.Width;
        var trueH = src.Height;

        if (src.Width > PreviewMaxWidth)
        {
            src.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
            {
                Mode = SixLabors.ImageSharp.Processing.ResizeMode.Max,
                Size = new SixLabors.ImageSharp.Size(PreviewMaxWidth, PreviewMaxWidth),
            }));
        }

        using var ms = new MemoryStream();
        src.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
        ms.Position = 0;

        var bmp = new System.Windows.Media.Imaging.BitmapImage();
        bmp.BeginInit();
        bmp.CacheOption = System.Windows.Media.Imaging.BitmapCacheOption.OnLoad;
        bmp.StreamSource = ms;
        bmp.EndInit();
        bmp.Freeze();
        return (bmp, trueW, trueH);
    }

    private const int PreviewMaxWidth = 720;

    /// <summary>Re-show whatever is selected. Called after a render lands.</summary>
    private void RefreshPreview() => ShowPreview(SelectedPiece());

    // ========================================================================
    //  DEPLOY
    // ========================================================================
    //
    // Everything here shells out to the repo rather than reimplementing it. The
    // numbers come from wpf/deploy-status.mjs and the ship comes from
    // deploy/publish.sh, which is PUBLISH.md made executable. A button that
    // carried its own copy of the procedure would be a second source of truth,
    // and the two would disagree the first time the runbook changed.

    private const string SiteUrlText = "https://jubilujah.com/";
    private bool _deploying;

    /// <summary>
    /// Anything the last measurement found that makes a deploy from this button
    /// unsafe or wrong. Currently: publish.sh ships to a path the box does not
    /// have. Carried so the confirmation dialog can say it rather than leaving it
    /// buried in a panel nobody reads twice.
    /// </summary>
    private string _deployWarning = "";

    /// <summary>Git Bash. Not the WSL bash.exe in system32, which cannot see W: or J:.</summary>
    private static string? GitBash()
    {
        foreach (var p in new[]
        {
            @"C:\Program Files\Git\bin\bash.exe",
            @"C:\Program Files (x86)\Git\bin\bash.exe",
            @"C:\Program Files\Git\usr\bin\bash.exe",
        }) if (File.Exists(p)) return p;
        return null;
    }

    private async Task ShowSiteAsync()
    {
        try
        {
            if (WvSite.CoreWebView2 == null)
            {
                // Same environment as the ChatGPT pane: one profile, one cookie
                // store, no second login.
                var env = await CoreWebView2Environment.CreateAsync(userDataFolder: _userDataFolder);
                await WvSite.EnsureCoreWebView2Async(env);
                // EnsureCoreWebView2Async can return with the control still not
                // initialised if the environment failed quietly, so this is
                // checked rather than assumed.
                WvSite.CoreWebView2?.Navigate(SiteUrlText);
            }
        }
        catch (Exception ex) { Log("Could not open the live site pane: " + ex.Message); }
    }

    private void BtnSiteReload_Click(object sender, RoutedEventArgs e)
    {
        try { WvSite.CoreWebView2?.Reload(); Log("Reloading " + SiteUrlText); }
        catch (Exception ex) { Log("Reload failed: " + ex.Message); }
    }

    private void BtnSiteOpen_Click(object sender, RoutedEventArgs e)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(SiteUrlText) { UseShellExecute = true }); }
        catch (Exception ex) { Log("Could not open a browser: " + ex.Message); }
    }

    private async void BtnDeployRefresh_Click(object sender, RoutedEventArgs e) => await RefreshDeployAsync();

    private sealed record Tile(string Name, string Detail, string Pending, string Colour);

    /// <summary>
    /// Measure this checkout, production and the CDN, and show the gap.
    ///
    /// The production half is an SSH round trip, so this runs off the UI thread
    /// and the view says it is measuring rather than freezing.
    /// </summary>
    private async Task RefreshDeployAsync()
    {
        if (_root.Length == 0) { DeployProd.Text = "repo root not resolved"; return; }
        DeployWhen.Text = "measuring, including an SSH round trip to the VPS...";
        BtnDeployRefresh.IsEnabled = false;

        try
        {
            var probe = await Task.Run(() => RunCapture("node", new[] { @"wpf\deploy-status.mjs", "--json" }, _root, 120));
            var doc = JsonNode.Parse(probe.StdOut);
            if (doc == null)
            {
                DeployProd.Text = "deploy-status returned nothing:\n" + probe.StdErr;
                DeployWhen.Text = "measure failed";
                return;
            }

            var loc = doc["local"];
            var prod = doc["production"];
            var cdn = doc["cdn"];
            var man = doc["manifest"];

            int LV(JsonNode? n) => n?.GetValue<int>() ?? 0;
            var reachable = prod?["reachable"]?.GetValue<bool>() ?? false;
            var deployed = prod?["deployed"]?.GetValue<bool>() ?? false;

            // "?" and "0" are different answers and only one of them means press
            // Deploy. An unreachable box reports the former.
            string Live(string key) => reachable && deployed ? LV(prod?[key]).ToString() : "?";
            string Gap(string key)
            {
                if (!reachable || !deployed) return "?";
                return Math.Max(0, LV(loc?[key]) - LV(prod?[key])).ToString();
            }
            string Colour(string key)
            {
                if (!reachable || !deployed) return "#E6AC00";
                return LV(loc?[key]) > LV(prod?[key]) ? "#E6AC00" : "#a8f0c0";
            }

            // The manifest gate is the one number that must never soften into a
            // zero: an unmeasured gate and a clean gate mean opposite things.
            var manChecked = man?["checked"]?.GetValue<bool>() ?? false;
            var wouldAdd = man?["wouldAdd"];
            var manCount = manChecked && wouldAdd != null ? LV(wouldAdd).ToString() : "?";

            DeployTiles.ItemsSource = new List<Tile>
            {
                new("Articles", $"{LV(loc?["articles"])} here, {Live("articles")} live", Gap("articles"), Colour("articles")),
                new("Images",   $"{LV(loc?["images"])} here, {Live("images")} live",     Gap("images"),   Colour("images")),
                new("Albums",   $"{LV(loc?["albums"])} on the drive, {LV(loc?["manifestAlbums"])} in the manifest",
                                manCount,
                                manCount == "0" ? "#a8f0c0" : "#E6AC00"),
            };

            _deployWarning = prod?["warning"]?.GetValue<string>() ?? "";

            if (!reachable)
                DeployProd.Text = "unreachable\n" + (prod?["reason"]?.GetValue<string>() ?? "");
            else if (!deployed)
                DeployProd.Text = "never deployed\n" + (prod?["reason"]?.GetValue<string>() ?? "");
            else
                DeployProd.Text =
                    $"{prod?["web"]?.GetValue<string>()}\n" +
                    $"last shipped {prod?["shipped"]?.GetValue<string>()}\n" +
                    $"pm2 {prod?["pm2"]?.GetValue<string>()} " +
                    $"{((prod?["running"]?.GetValue<bool>() ?? false) ? "online" : "STOPPED")}   " +
                    $"origin {prod?["http"]?.GetValue<string>()}   public {prod?["public"]?.GetValue<string>()}\n" +
                    $"{LV(prod?["articles"])} articles, {LV(prod?["images"])} images live" +
                    (_deployWarning.Length > 0 ? "\n\n⚠ " + _deployWarning : "");

            DeployProd.Foreground = _deployWarning.Length > 0 ? WarnAmber : TickFresh;

            DeployManifest.Text = manChecked
                ? (manCount == "0"
                    ? $"current — would add: 0\n({man?["source"]?.GetValue<string>()})"
                    : $"STALE — would add: {manCount}\n({man?["source"]?.GetValue<string>()})\nreconcile before publishing")
                : "not checked\n" + (man?["reason"]?.GetValue<string>() ?? "");
            DeployManifest.Foreground = manCount == "0" ? TickFresh : WarnAmber;

            DeployCdn.Text = (cdn?["configured"]?.GetValue<bool>() ?? false)
                ? "bucket " + cdn?["bucket"]?.GetValue<string>()
                : "not configured\n" + (cdn?["reason"]?.GetValue<string>() ?? "");

            DeployWhen.Text = "measured " + DateTime.Now.ToString("HH:mm:ss");
        }
        catch (Exception ex)
        {
            DeployWhen.Text = "measure failed";
            DeployProd.Text = ex.Message;
        }
        finally { BtnDeployRefresh.IsEnabled = true; }
    }

    /// <summary>
    /// Preflight. Checks the SSH key, the repo, the music drive and the Step 0
    /// manifest gate, and changes nothing.
    ///
    /// publish.sh has no --check mode, so this runs the gate that publish.sh
    /// itself runs — deploy/check-manifest.mjs — rather than a private
    /// reimplementation of it.
    /// </summary>
    private async void BtnDeployCheck_Click(object sender, RoutedEventArgs e)
    {
        BtnDeployCheck.IsEnabled = false;
        try
        {
            Log("\n=== preflight ===");
            Log(Directory.Exists(_root) ? $"  repo        ok   {_root}" : $"  repo        MISSING  {_root}");
            Log(Directory.Exists(_musicRoot) ? $"  music       ok   {_musicRoot}" : $"  music       MISSING  {_musicRoot}");

            var key = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                ".ssh", "id_ed25519_jubilee_prod");
            Log(File.Exists(key) ? "  ssh key     ok   " + key : "  ssh key     MISSING  " + key);
            Log(GitBash() != null ? "  git bash    ok" : "  git bash    MISSING — publish.sh cannot run without it");

            Log("  manifest gate (deploy/check-manifest.mjs)…");
            var r = await Task.Run(() => RunCapture("node", new[] { @"deploy\check-manifest.mjs" }, _root, 180));
            foreach (var line in (r.StdOut + r.StdErr).Split('\n'))
                if (line.Trim().Length > 0) Log("    " + line.TrimEnd('\r'));
            Log(r.Code == 0
                ? "  manifest    current — would add: 0"
                : $"  manifest    exit {r.Code} — treat as STALE until reconciled");
            Log("=== preflight done, nothing was changed ===");

            await RefreshDeployAsync();
        }
        finally { BtnDeployCheck.IsEnabled = true; }
    }

    private async void BtnDeploy_Click(object sender, RoutedEventArgs e)
    {
        // REFUSE, do not warn. publish.sh syncs the R2 music bucket in Step 1 and
        // ships the site in Step 2, so a run that is going to die on a bad
        // destination path dies AFTER the CDN has already been written — a
        // half-done release, with new audio live against an old site. A warning
        // the user can click past is not good enough for that ordering.
        if (_deployWarning.Length > 0)
        {
            MessageBox.Show(
                "Not shipping, because this deploy would not land where the site is served from.\n\n" +
                _deployWarning + "\n\n" +
                "publish.sh syncs the CDN before it ships the site, so running it now would push " +
                "audio to R2 and then fail on the destination — new audio live against an old site.\n\n" +
                "Fix PROD_PATH in deploy/publish.sh (and its tar layout, prod keeps the web app in " +
                "web/ rather than app/web/), then press Refresh here.",
                "Deploy blocked", MessageBoxButton.OK, MessageBoxImage.Stop);
            Log("Deploy blocked: " + _deployWarning);
            return;
        }
        if (DeployWhen.Text.StartsWith("not measured", StringComparison.Ordinal))
        {
            MessageBox.Show(
                "Press Refresh first. Nothing has been measured this session, so there is no way " +
                "to tell whether this deploy would land where the site is served from.",
                "Deploy blocked", MessageBoxButton.OK, MessageBoxImage.Stop);
            return;
        }

        var flags = new List<string> { "--yes" };
        if (ChkDeploySiteOnly.IsChecked == true) flags.Add("--site-only");
        if (ChkDeploySkipManifest.IsChecked == true) flags.Add("--skip-manifest-check");
        if (ChkDeployNoBackup.IsChecked == true) flags.Add("--no-backup");

        var ask = MessageBox.Show(
            "Ship the site to production?\n\n" +
            "This runs the Step 0 manifest gate, syncs music to the R2 CDN, snapshots the " +
            "current production tree, ships this repo to the VPS, reinstalls, rebuilds and " +
            "restarts PM2, then verifies.\n\n" +
            "deploy/publish.sh " + string.Join(' ', flags) + "\n\n" +
            "The live site will restart.",
            "Deploy JubiLujah", MessageBoxButton.YesNo, MessageBoxImage.Warning);
        if (ask != MessageBoxResult.Yes) { Log("Deploy cancelled."); return; }

        await RunPublishAsync(string.Join(' ', flags));
        await RefreshDeployAsync();
        try { WvSite.CoreWebView2?.Reload(); } catch { }
    }

    /// <summary>
    /// Run deploy/publish.sh under Git Bash, streaming every line into the log so
    /// a long ship is watchable rather than a frozen window.
    /// </summary>
    private async Task RunPublishAsync(string args)
    {
        if (_deploying) { Log("A deploy is already running."); return; }
        var bash = GitBash();
        if (bash == null) { Log("Git Bash not found. The deploy runs deploy/publish.sh and needs it."); return; }
        if (_root.Length == 0) { Log("Repo root not resolved, cannot find deploy/publish.sh."); return; }

        _deploying = true;
        BtnDeploy.IsEnabled = false;
        BtnDeployCheck.IsEnabled = false;
        Log($"\n=== deploy/publish.sh {args} ===");

        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo(bash)
            {
                WorkingDirectory = _root,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
            };
            psi.ArgumentList.Add("-lc");
            psi.ArgumentList.Add($"cd \"$(cygpath -u '{_root.Replace("'", "'\\''")}')\" && bash deploy/publish.sh {args} 2>&1");

            using var proc = new System.Diagnostics.Process { StartInfo = psi, EnableRaisingEvents = true };
            proc.OutputDataReceived += (_, ev) => { if (ev.Data != null) Log("  " + ev.Data); };
            proc.ErrorDataReceived += (_, ev) => { if (ev.Data != null) Log("  " + ev.Data); };
            proc.Start();
            proc.BeginOutputReadLine();
            proc.BeginErrorReadLine();
            await proc.WaitForExitAsync();

            Log(proc.ExitCode == 0
                ? "=== publish.sh finished cleanly ==="
                : $"=== publish.sh exited {proc.ExitCode}. Nothing further was attempted. ===");
        }
        catch (Exception ex) { Log("Deploy failed to start: " + ex.Message); }
        finally
        {
            _deploying = false;
            BtnDeploy.IsEnabled = true;
            BtnDeployCheck.IsEnabled = true;
        }
    }

    private readonly record struct Captured(string StdOut, string StdErr, int Code);

    /// <summary>Run a console tool and capture it whole. Used for the JSON probes.</summary>
    private static Captured RunCapture(string exe, string[] args, string cwd, int timeoutSeconds)
    {
        var psi = new System.Diagnostics.ProcessStartInfo(exe)
        {
            WorkingDirectory = cwd,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
        };
        foreach (var a in args) psi.ArgumentList.Add(a);
        using var p = System.Diagnostics.Process.Start(psi)!;
        var so = p.StandardOutput.ReadToEnd();
        var se = p.StandardError.ReadToEnd();
        if (!p.WaitForExit(timeoutSeconds * 1000)) { try { p.Kill(true); } catch { } }
        return new Captured(so, se, p.HasExited ? p.ExitCode : -1);
    }

    /// <summary>
    /// Compile the site JSON the pages actually read.
    ///
    /// Writing the image into an article is only half the job: /articles and
    /// /backstage read compiled JSON, so until these run the picture is on disk
    /// and the page still shows its fallback panel. Shelling out to the repo's own
    /// compilers rather than writing the JSON here keeps one source of truth —
    /// gen-articles.mjs also resolves the image path, and gen-backstage.mjs
    /// derives a backstage picture from what is on disk rather than from any
    /// claim, which is precisely why this tool does not write either file itself.
    /// </summary>
    private async void BtnRebuildJson_Click(object sender, RoutedEventArgs e)
    {
        BtnRebuildJson.IsEnabled = false;
        try
        {
            foreach (var script in new[] { @"core\articles\gen-articles.mjs", @"app\web\scripts\gen-backstage.mjs" })
            {
                Log($"\n=== node {script} ===");
                var r = await Task.Run(() => RunCapture("node", new[] { script }, _root, 180));
                foreach (var line in (r.StdOut + r.StdErr).Split('\n'))
                    if (line.Trim().Length > 0) Log("  " + line.TrimEnd('\r'));
                Log(r.Code == 0 ? "  ok" : $"  exited {r.Code}");
            }
        }
        finally { BtnRebuildJson.IsEnabled = true; }
    }

    // ========================================================================
    //  LAYOUT, CONFIG AND PATHS
    // ========================================================================

    private void ApplyLayout()
    {
        PanelCol.Width = new GridLength(Math.Max(MinPanelWidth, _panelWidth), GridUnitType.Pixel);
        LogRow.Height = new GridLength(Math.Max(MinLogHeight, _logHeight), GridUnitType.Pixel);
    }

    /// <summary>
    /// Write the current splitter positions back to studio.config.json.
    ///
    /// Runs on close, and again whenever settings are saved by hand. Zero and NaN
    /// are refused rather than stored: a window closed while minimised measures
    /// everything at zero, and writing that would reopen with both the panel and
    /// the log collapsed and no obvious way back.
    /// </summary>
    private void SaveLayout()
    {
        var w = PanelCol.ActualWidth;
        var h = LogRow.ActualHeight;
        if (w >= MinPanelWidth && !double.IsNaN(w)) _panelWidth = w;
        if (h >= MinLogHeight && !double.IsNaN(h)) _logHeight = h;
        WriteConfig();
    }

    /// <summary>
    /// Walk up from the binary looking for THIS repo's marker,
    /// core/articles/gen-articles.mjs.
    ///
    /// NO FALLBACK PATH. An earlier build of this tool defaulted its root to a
    /// hard-coded W:\JubiLujah.com when the marker was not found, which means a
    /// stray copy of the exe anywhere on the machine would have written into that
    /// repo. An unresolved root now says which folder it started from and refuses
    /// to scan, which is the recoverable failure.
    /// </summary>
    private void ResolvePaths()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "core", "articles", "gen-articles.mjs"))) break;
            dir = dir.Parent;
        }
        _root = dir?.FullName ?? "";
        _toolDir = _root.Length > 0 ? Path.Combine(_root, "wpf") : AppContext.BaseDirectory;
        _configFile = Path.Combine(_toolDir, "studio.config.json");
        _personasRoot = _root.Length > 0 ? Path.Combine(_root, "personas") : "";

        // The WebView2 profile must live on a LOCAL disk. The tool directory is
        // normally on a mapped network share (W: -> \\HDC-INSPIRESERVER\Websites),
        // and Chromium does not support a user data folder on a network path: the
        // browser process faults with STATUS_IN_PAGE_ERROR (0xc0000006) the moment
        // the share goes stale, which kills the pane and then the app. Keep the
        // cookie store next to the user's other local app data instead.
        _userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubiLujah", "Studio", "webview2");
        Directory.CreateDirectory(_userDataFolder);

        // One-time migration so the ChatGPT login from the older in-repo tool
        // survives the move off the share.
        try
        {
            var legacy = Path.Combine(_root, "tools", "ArticleImageStudio", ".webview2", "EBWebView");
            var moved = Path.Combine(_userDataFolder, "EBWebView");
            if (_root.Length > 0 && Directory.Exists(legacy) && !Directory.Exists(moved))
                CopyTree(legacy, moved);
        }
        catch { /* a fresh login is an acceptable fallback */ }
    }

    // Recursive directory copy. Used only for the one-time profile migration off
    // the network share; files the browser has locked are skipped rather than
    // failing the whole copy.
    private static void CopyTree(string from, string to)
    {
        Directory.CreateDirectory(to);
        foreach (var file in Directory.GetFiles(from))
        {
            try { File.Copy(file, Path.Combine(to, Path.GetFileName(file)), overwrite: true); }
            catch { }
        }
        foreach (var sub in Directory.GetDirectories(from))
            CopyTree(sub, Path.Combine(to, Path.GetFileName(sub)));
    }

    // ---- config (git-ignored) ----------------------------------------------
    private void LoadConfig()
    {
        try
        {
            if (!File.Exists(_configFile)) return;
            var cfg = JsonNode.Parse(File.ReadAllText(_configFile));

            var r = cfg?["repoRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(r)) _root = r.TrimEnd('\\', '/');
            var p = cfg?["personasRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(p)) _personasRoot = p.TrimEnd('\\', '/');
            var m = cfg?["musicRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(m)) _musicRoot = m.TrimEnd('\\', '/');
            var loc = cfg?["locationUrl"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(loc)) LocationUrl.Text = loc;

            // Absent means "on", so a config written before the author feature
            // existed does not silently turn it off.
            var inc = cfg?["includeAuthor"]?.GetValue<bool>();
            if (inc is bool b) ChkIncludeAuthor.IsChecked = b;

            var layout = cfg?["layout"];
            var pw = layout?["panelWidth"]?.GetValue<double>();
            var lh = layout?["logHeight"]?.GetValue<double>();
            if (pw is double savedWidth && savedWidth >= MinPanelWidth) _panelWidth = savedWidth;
            if (lh is double savedHeight && savedHeight >= MinLogHeight) _logHeight = savedHeight;
        }
        catch { /* a malformed config just means "start from defaults" */ }
    }

    private void BtnSaveCfg_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        // Fold the current splitter positions in too, so "Save settings" saves
        // what the window looks like as well as where it reads from.
        SaveLayout();
        Log("Settings saved → studio.config.json (git-ignored).");
    }

    private void WriteConfig()
    {
        try
        {
            var cfg = new JsonObject
            {
                ["repoRoot"] = _root,
                ["personasRoot"] = _personasRoot,
                ["musicRoot"] = _musicRoot,
                ["locationUrl"] = LocationUrl.Text ?? CHATGPT,
                ["includeAuthor"] = ChkIncludeAuthor.IsChecked == true,
                ["layout"] = new JsonObject
                {
                    ["panelWidth"] = Math.Round(_panelWidth),
                    ["logHeight"] = Math.Round(_logHeight),
                },
            };
            Directory.CreateDirectory(Path.GetDirectoryName(_configFile)!);
            File.WriteAllText(_configFile, cfg.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
        }
        catch (Exception ex) { Log("Could not save settings: " + ex.Message); }
    }

    private void ReadRootFromUi()
    {
        _root = (RepoRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        _personasRoot = (PersonasRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        _musicRoot = (MusicRoot.Text ?? "").Trim().TrimEnd('\\', '/');
    }

    // ---- init WebView2 with a persistent profile (this is the cookie store) -
    private async Task InitAsync()
    {
        try
        {
            // White (not the default black) so a slow/blank first paint never
            // shows as a black page.
            Wv.DefaultBackgroundColor = System.Drawing.Color.White;
            var env = await CoreWebView2Environment.CreateAsync(userDataFolder: _userDataFolder);
            await Wv.EnsureCoreWebView2Async(env);
            Wv.CoreWebView2.WebMessageReceived += OnWebMessage;
            // If the very first load fails or lands blank, retry once so the app
            // always comes up on ChatGPT rather than a black/blank page.
            Wv.CoreWebView2.NavigationCompleted += (s, e) =>
            {
                var url = Wv.CoreWebView2.Source ?? "";
                if (!_homeRetried && (!e.IsSuccess || url.Length == 0 || url.StartsWith("about:")))
                {
                    _homeRetried = true;
                    Wv.CoreWebView2.Navigate(CHATGPT);
                }
            };
            Wv.CoreWebView2.Navigate(CHATGPT);
            _ready = true;

            Log("Article images are written into app/web/public/images/articles and recorded in each article's image field.");
            Log("Backstage images are written into app/web/public/images/backstage, where gen-backstage.mjs finds them by slug.");
            Log("Log in to ChatGPT in the browser, then pick a section tab and generate.");
            ScanAll();
            ReportReferenceCoverage();
        }
        catch (Exception ex)
        {
            Log("Init failed: " + ex.Message);
            MessageBox.Show(
                "WebView2 failed to start. Make sure the WebView2 Runtime is installed " +
                "(it ships with Edge on Windows 11).\n\n" + ex.Message,
                "JubiLujah Studio", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ========================================================================
    //  SCANNING THE SOURCE FOLDERS
    // ========================================================================

    /// <summary>
    /// The flattened scope. Not a section and never a folder on disk, which is
    /// why it carries a name no key could collide with.
    /// </summary>
    private const string AllKey = "__all";

    private ListBox ListFor(string key) => key switch
    {
        AllKey        => LstAll,
        "articles"    => LstArticles,
        "interviews"  => LstInterviews,
        "stories"     => LstStories,
        _             => LstTestimonies,
    };

    /// <summary>Where a section's images live. The two trees do not share a folder.</summary>
    private string ImagesDirFor(Kind kind) =>
        Path.Combine(WebPublic, "images", kind == Kind.Article ? "articles" : "backstage");

    /// <summary>Every piece, in section order, for the All tab.</summary>
    private List<Piece> AllPieces()
    {
        var all = new List<Piece>();
        foreach (var s in Sections)
            if (_bySection.TryGetValue(s.Key, out var list)) all.AddRange(list);
        return all;
    }

    // Not FirstOrDefault(...).Display: the tuple elements are declared
    // non-nullable, so a miss would hand back a null the compiler believes cannot
    // be null. An explicit loop keeps this honest under <Nullable>enable.
    private static string DisplayFor(string key)
    {
        if (key == AllKey) return "All sections";
        foreach (var s in Sections) if (s.Key == key) return s.Display;
        return key;
    }

    private static Kind KindFor(string key)
    {
        foreach (var s in Sections) if (s.Key == key) return s.Kind;
        return Kind.Article;
    }

    private string SelectedKey()
    {
        if (Tabs.SelectedItem is TabItem t && t.Tag is string s) return s;
        return Sections[0].Key;
    }

    // Refresh and Scan are the two places the user asks for a clean read of the
    // drive, and they are the only things that clear the session ticks. That is
    // the whole contract: a piece finished during a run stays on screen with its
    // green tick until you press Refresh, and then it is gone.
    private void BtnScan_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        _sessionDone.Clear();
        _completedPaths.Clear();   // same reason as Refresh: the drive is the truth
        FillPersonaPicker();
        ScanAll();
    }

    private void BtnReload_Click(object sender, RoutedEventArgs e)
    {
        var cleared = _sessionDone.Count;
        _sessionDone.Clear();

        // The "already done this session" guard is cleared too, and that is a fix
        // rather than a convenience.
        //
        // It exists to stop one run looping on the same piece. But it outlived the
        // truth on disk: once a piece was generated, deleting or resetting its
        // image left the app refusing to generate it again for the rest of the
        // session. The symptom was the scan reporting "27 pending" on one line and
        // "0 pending" on the next, because ScanAll counts from disk and Pending()
        // also subtracted this set.
        //
        // Refresh means "re-read the truth from the drive", so the drive wins.
        // Losing the loop guard is safe: RunBatch also checks HasImage, which is
        // set the moment an image is saved, so a run still cannot repeat itself
        // within its own pass.
        var guard = _completedPaths.Count;
        _completedPaths.Clear();

        ScanAll();
        if (cleared > 0 || guard > 0)
            Log($"Refreshed from disk. {cleared} finished row(s) cleared, {guard} session lock(s) released.");
    }

    /// <summary>
    /// Show-all only changes what is DISPLAYED, so it re-renders and does not
    /// clear the session ticks. It shares no handler with Refresh for exactly that
    /// reason: ticking a display switch should not throw away the record of what
    /// this session finished.
    /// </summary>
    /// Bound to Checked and Unchecked rather than Click, so the worklists also
    /// re-render when something sets IsChecked in code.
    private void ChkShowAll_Click(object sender, RoutedEventArgs e) => RenderAll();

    /// <summary>Re-render every worklist from what is already in memory.</summary>
    private void RenderAll()
    {
        // Checked can fire during InitializeComponent, before the lists exist.
        if (LstAll == null) return;
        foreach (var s in Sections) RenderList(s.Key);
        RenderList(AllKey);
    }

    private void Tabs_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        // Only react to the TabControl itself, not to selection inside a ListBox.
        if (!ReferenceEquals(e.OriginalSource, Tabs)) return;
        if (!_ready) return;
        var key = SelectedKey();
        Log($"— {DisplayFor(key)}: {Pending(key).Count} piece(s) pending.");
        RefreshPreview();   // the new tab has its own selection, or none
    }

    private void ScanAll()
    {
        ReadRootFromUi();
        if (_root.Length == 0 || !Directory.Exists(_root))
        {
            Log($"⚠ Repo root not found: {(_root.Length == 0 ? "(unresolved)" : _root)}");
            Log($"  Looked for core\\articles\\gen-articles.mjs upward from {AppContext.BaseDirectory}");
            Log("  Set the correct path in Settings and click Scan sections.");
            foreach (var s in Sections) { _bySection[s.Key] = new(); ListFor(s.Key).Items.Clear(); }
            LstAll.Items.Clear();
            return;
        }

        int totalPending = 0, totalDone = 0, missingDirs = 0;
        foreach (var (key, display, rel, kind) in Sections)
        {
            var dir = Path.Combine(_root, rel);
            var list = new List<Piece>();

            if (!Directory.Exists(dir))
            {
                missingDirs++;
                Log($"  ⚠ {display}: folder missing ({rel})");
            }
            else
            {
                // TOP LEVEL ONLY. core/articles also holds gen-articles.mjs and
                // retheme-prompts.mjs, which are not markdown and are skipped by
                // the filter, and core/backstage holds a README.md at its own
                // level that is not a piece. Recursing would find neither problem
                // and invent new ones.
                foreach (var file in Directory.EnumerateFiles(dir, "*.md", SearchOption.TopDirectoryOnly).OrderBy(f => f))
                {
                    if (Path.GetFileName(file).Equals("README.md", StringComparison.OrdinalIgnoreCase)) continue;
                    var piece = kind == Kind.Article
                        ? ReadArticle(file, key)
                        : ReadBackstage(file, key);
                    if (piece != null) list.Add(piece);
                }
            }

            _bySection[key] = list;
            totalPending += list.Count(a => !a.HasImage);
            totalDone += list.Count(a => a.HasImage);
            RenderList(key);
        }

        // Last, because it reads from every section list the loop just filled.
        RenderList(AllKey);

        Log($"Scanned {_root} — {totalPending} pending, {totalDone} already imaged" +
            (missingDirs > 0 ? $", {missingDirs} folder(s) missing." : "."));
    }

    // Which of the author portraits are actually on disk. Reported once at
    // startup rather than discovered one failed piece at a time: with the author
    // required in every image, a missing portrait costs every piece that voice
    // wrote, and in this library that is dozens.
    private void ReportReferenceCoverage()
    {
        if (ChkIncludeAuthor.IsChecked != true) { Log("Author-in-image is OFF — images will not carry their author."); return; }
        if (!Directory.Exists(_personasRoot))
        {
            Log($"⚠ Author portraits folder not found: {_personasRoot}");
            Log("  Every piece will be skipped until this path is right. Fix it in Settings and Scan again.");
            return;
        }
        var missing = Family.Where(p => ReferencePathFor(p.Slug) == null).Select(p => p.Slug).ToList();
        if (missing.Count == 0) { Log($"Author portraits: all {Family.Length} found in {_personasRoot}."); return; }
        Log($"⚠ Author portraits: {Family.Length - missing.Count} of {Family.Length} found. Missing → {string.Join(", ", missing)}");
        Log("  Pieces by those voices will be skipped rather than imaged without their author.");
    }

    private void RenderList(string key)
    {
        var box = ListFor(key);
        // A render clears and refills, which throws the selection away. During a
        // run this happens after every image, so without holding the index the
        // preview would blank itself every few minutes while the user watched.
        var keep = box.SelectedIndex;
        box.Items.Clear();
        var list = key == AllKey
            ? AllPieces()
            : (_bySection.TryGetValue(key, out var l) ? l : null);
        if (list == null) return;

        var showAll = ChkShowAll.IsChecked == true;
        foreach (var a in list)
        {
            var fresh = _sessionDone.Contains(a.Path);
            // Hide the already-imaged, EXCEPT the ones finished this session:
            // those stay, ticked, until Refresh. Dropping a row the moment it
            // succeeded would mean the tick was never actually seen.
            if (a.HasImage && !showAll && !fresh) continue;

            box.Items.Add(new Row
            {
                Mark = a.HasImage || fresh ? "✓" : "",
                MarkBrush = fresh ? TickFresh : TickOld,
                Title = a.Title,
                Piece = a,
            });
        }
        if (box.Items.Count == 0)
            box.Items.Add(new Row
            {
                MarkBrush = RowPlain,
                Title = list.Count == 0 ? "(no pieces in this folder)" : "(every piece has an image)",
            });

        if (keep >= 0 && keep < box.Items.Count) box.SelectedIndex = keep;
    }

    // ---- reading an ARTICLE -------------------------------------------------
    //
    // Deliberately line-based rather than a YAML dependency, and matched to what
    // core/articles/gen-articles.mjs actually parses: everything before the first
    // colon is the key, everything after it is the value, trimmed. Values are
    // UNQUOTED here — an article reads `title: A Blurred Note Rallies No One` —
    // so the quote-anchored pattern the InspireManna build used would match no
    // line in this repo at all and every article would scan as empty.
    private static readonly Regex FieldRx =
        new(@"^(?<key>[A-Za-z][A-Za-z0-9_]*):\s*(?<val>.*?)\s*$", RegexOptions.Compiled);

    // Static because it reads nothing but the file in front of it. That is worth
    // keeping true: it is the one parser whose output decides what gets sent to a
    // GPU and written back into the library, so it stays testable in isolation.
    private static Piece? ReadArticle(string path, string key)
    {
        try
        {
            var text = File.ReadAllText(path);
            if (!text.StartsWith("---")) return null;
            var end = text.IndexOf("\n---", 3, StringComparison.Ordinal);
            if (end < 0) return null;

            var f = new Dictionary<string, string>(StringComparer.Ordinal);
            foreach (var line in text.Substring(0, end).Split('\n'))
            {
                var m = FieldRx.Match(line.TrimEnd('\r'));
                if (m.Success) f[m.Groups["key"].Value] = Unquote(m.Groups["val"].Value);
            }
            string Get(string k) => f.TryGetValue(k, out var v) ? v : "";

            // gen-articles.mjs takes the slug from frontmatter and falls back to
            // the filename, so this does the same and in the same order.
            var slug = Get("slug").Length > 0 ? Get("slug") : Path.GetFileNameWithoutExtension(path);

            return new Piece
            {
                Path = path,
                Slug = slug,
                Section = key,
                Kind = Kind.Article,
                Title = Get("title").Length > 0 ? Get("title") : slug,
                Author = Get("author"),
                AuthorSlug = Get("personaSlug"),
                Prompt = Get("imagePrompt"),
                ImageFile = Get("image"),
            };
        }
        catch { return null; }
    }

    /// <summary>Frontmatter values are bare, but a quoted one must not keep its quotes.</summary>
    private static string Unquote(string v)
    {
        if (v.Length >= 2 && ((v[0] == '"' && v[^1] == '"') || (v[0] == '\'' && v[^1] == '\'')))
            return v[1..^1];
        return v;
    }

    // ---- reading a BACKSTAGE piece -----------------------------------------
    //
    // A different shape entirely, and it has to be read the way
    // app/web/scripts/gen-backstage.mjs reads it:
    //
    //   ``` … ```        leading metadata fence (Song / Album / Artist / Format)
    //   ```prompt … ```  the ready-to-render image prompt
    //   # Title          the reader-facing headline
    //
    // There is no image field to fill in. gen-backstage.mjs resolves the picture
    // by looking for <slug>.<ext> in app/web/public/images/backstage at generate
    // time, so the file on disk IS the record and this tool writes nothing back
    // into the .md. That is not a shortcut: a field claiming a picture nobody
    // made would mark the piece done and it would never be queued again.
    private Piece? ReadBackstage(string path, string key)
    {
        try
        {
            var text = File.ReadAllText(path);
            var slug = Path.GetFileNameWithoutExtension(path);

            var prompt = Regex.Match(text, @"```prompt\s*\r?\n(?<p>[\s\S]*?)\r?\n```", RegexOptions.None);
            var title = Regex.Match(text, @"^#\s+(?<t>.+?)\s*$", RegexOptions.Multiline);
            var artist = Regex.Match(text, @"^Artist:\s*(?<a>.+?)\s*$", RegexOptions.Multiline);

            var author = artist.Success ? artist.Groups["a"].Value : "";
            var authorSlug = author.Length > 0
                ? author.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0].ToLowerInvariant()
                : "";

            return new Piece
            {
                Path = path,
                Slug = slug,
                Section = key,
                Kind = Kind.Backstage,
                Title = title.Success ? title.Groups["t"].Value : slug,
                Author = author,
                AuthorSlug = authorSlug,
                Prompt = prompt.Success ? prompt.Groups["p"].Value.Trim() : "",
                ImageFile = ExistingBackstageImage(slug),
            };
        }
        catch { return null; }
    }

    /// <summary>
    /// The picture on disk for a backstage slug, in the extension order
    /// gen-backstage.mjs itself searches, or "" when there is none.
    /// </summary>
    private string ExistingBackstageImage(string slug)
    {
        var dir = ImagesDirFor(Kind.Backstage);
        if (!Directory.Exists(dir)) return "";
        foreach (var ext in new[] { ".webp", ".jpg", ".jpeg", ".png" })
            if (File.Exists(Path.Combine(dir, slug + ext))) return slug + ext;
        return "";
    }

    // ---- writing back into an article --------------------------------------

    /// <summary>
    /// Record the rendered filename in an article's `image:` field, leaving every
    /// other byte alone.
    ///
    /// INSERTS the field when it is absent, which is the normal case here: most of
    /// the library was written before any picture existed and carries no `image:`
    /// line at all. The InspireManna build required the key to already be there
    /// and returned false otherwise, which on this repo would have written the
    /// picture to disk and then reported a failure for every article that needed
    /// one. The new line goes directly after `imagePrompt:`, where the compiler
    /// and every hand-edited article already put it.
    ///
    /// A BARE FILENAME, not a path. gen-articles.mjs resolves a bare name to
    /// /images/articles/&lt;file&gt; and passes a rooted path through untouched, so
    /// writing a path here would work today and break the moment that folder moves.
    /// </summary>
    private static bool WriteImageField(string path, string fileName)
    {
        var text = File.ReadAllText(path);
        if (!text.StartsWith("---")) return false;
        var end = text.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (end < 0) return false;

        var head = text.Substring(0, end);
        var tail = text.Substring(end);

        var existing = new Regex(@"^image:.*$", RegexOptions.Multiline);
        if (existing.IsMatch(head))
        {
            head = existing.Replace(head, "image: " + fileName, 1);
        }
        else
        {
            var after = new Regex(@"^(imagePrompt:.*)$", RegexOptions.Multiline);
            if (after.IsMatch(head))
                head = after.Replace(head, "$1\nimage: " + fileName, 1);
            else
                head = head.TrimEnd('\r', '\n') + "\nimage: " + fileName;
        }

        File.WriteAllText(path, head + tail, new UTF8Encoding(false));
        return true;
    }

    /// <summary>
    /// Write a rewritten prompt back into an article's `imagePrompt:` field.
    ///
    /// This runs only after a rewritten prompt has actually produced an image. A
    /// prompt the content filter refuses is worthless to the queue: the article
    /// would fail the same way on every future run, forever, because the stored
    /// prompt is the thing the generator keeps resubmitting. Replacing it with the
    /// wording that worked is the whole point.
    ///
    /// Written on ONE line, because gen-articles.mjs reads scalar key: value pairs
    /// and a newline inside the value would silently truncate the prompt.
    ///
    /// Backstage prompts live in a fenced block and are not rewritten in place:
    /// that file's prompt block carries the §8.1 Image Core annotations around it,
    /// and a sanitiser editing it would be rewriting an editorial artifact rather
    /// than a field.
    /// </summary>
    private static bool WriteImagePrompt(string path, string prompt)
    {
        var text = File.ReadAllText(path);
        if (!text.StartsWith("---")) return false;
        var end = text.IndexOf("\n---", 3, StringComparison.Ordinal);
        if (end < 0) return false;

        var head = text.Substring(0, end);
        var tail = text.Substring(end);
        var rx = new Regex(@"^imagePrompt:.*$", RegexOptions.Multiline);
        if (!rx.IsMatch(head)) return false;

        var oneLine = Regex.Replace(prompt, @"\s+", " ").Trim();
        head = rx.Replace(head, "imagePrompt: " + oneLine, 1);
        File.WriteAllText(path, head + tail, new UTF8Encoding(false));
        return true;
    }

    // Rewrites a prompt the content filter refused, one escalating pass at a time.
    //
    // The filter does not say what it objected to, so this cannot be surgical. It
    // is ordered by what actually trips an image filter most often, softening the
    // likeliest cause first and keeping as much of the author's scene as possible:
    //
    //   1. Ages and minors. Precise ages attached to people ("a six-year-old", "in
    //      his sixties") are the single most common trigger, and anything reading
    //      as a child in a described physical scene is the most sensitive class of
    //      all. Generalise the ages, keep the people.
    //   2. Objects that can read as a weapon. A rod, a blade, a pipe. Harmless in
    //      context, and the filter has no context.
    //   3. Physical contact and body description, which reads differently to a
    //      classifier than it does to a reader.
    //   4. Named real people and anything sacred that must never be depicted.
    //   5. Last resort: keep the setting and the light, drop the specific human
    //      staging entirely. A plainer image beats no image.
    //
    // The house look (warm light, 16:9, photorealistic) survives every pass,
    // because that is what makes the picture usable on the site.
    private static string SanitizeForFilter(string prompt, int pass)
    {
        var p = prompt;

        if (pass >= 1)
        {
            // Precise ages and age brackets attached to a person.
            p = Regex.Replace(p, @"\b(?:a|an|the)?\s*\b\d{1,3}[-\s]year[-\s]old\b", "adult", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\bin (?:his|her|their) (?:early |mid |late )?(?:twenties|thirties|forties|fifties|sixties|seventies|eighties)\b", "", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:a |an )?(?:young|little|small|older|elderly)\s+(?=(?:man|woman|boy|girl|child|apprentice|student|father|mother|daughter|son))", "a ", RegexOptions.IgnoreCase);
            // Minors become adults. This is the class the filter guards hardest.
            p = Regex.Replace(p, @"\b(?:child|children|kid|kids|boy|boys|girl|girls|toddler|infant|baby|babies|teenager|teen)\b", "person", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\bpupils?\b|\bschoolchildren\b", "students", RegexOptions.IgnoreCase);
        }

        if (pass >= 2)
        {
            // Anything a classifier could read as a weapon, held or otherwise.
            p = Regex.Replace(p, @"\b(?:bent |broken |rusty |metal |steel |iron )?\b(?:conduit|pipe|rod|bar|blade|knife|shears|axe|hammer|chain|wire|cable)\b", "tool", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\bhold(?:s|ing)? up\b", "showing", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:gripping|clutching|wielding|brandishing)\b", "holding", RegexOptions.IgnoreCase);
        }

        if (pass >= 3)
        {
            // Physical contact and body description.
            p = Regex.Replace(p, @"\b(?:shoulder to shoulder|arm in arm|embracing|hugging|holding hands|hand on (?:his|her|their) (?:shoulder|arm|back|knee|wrist))\b", "standing together", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:bare|barefoot|shirtless|wet|tearful|crying|weeping|sobbing)\b", "", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:on (?:his|her|their) (?:lap|knees)|kneeling|lying down|in bed|hospital bed)\b", "seated", RegexOptions.IgnoreCase);
        }

        if (pass >= 4)
        {
            // Real people, and the one face that is never depicted.
            p = Regex.Replace(p, @"\b(?:Yeshua|Jesus|Christ|Messiah|Yahuah|God|the Father)\b", "a figure of welcome", RegexOptions.IgnoreCase);
            p = Regex.Replace(p, @"\b(?:blood|wound|scar|bruise|injury|injured|dying|dead|death|funeral|coffin|grave)\b", "", RegexOptions.IgnoreCase);
        }

        if (pass >= 5)
        {
            // Last resort. Keep the light, the mood and the ratio, drop the
            // staging. ONE adult stays in the frame — the slot the author clause
            // then fills — because a people-free scene has nowhere to put them.
            var warm = "warm golden light filling the room, soft natural daylight, "
                     + "shallow depth of field, warm color grade, photorealistic, cinematic, 16:9";
            p = "A bright welcoming interior with a table, open books and simple everyday objects, "
              + "one adult standing quietly near the window, " + warm;
        }

        // Tidy the damage the substitutions leave behind.
        p = Regex.Replace(p, @"\s{2,}", " ");
        p = Regex.Replace(p, @"\s+,", ",");
        p = Regex.Replace(p, @",\s*,+", ",");
        p = Regex.Replace(p, @"^\s*,\s*", "");
        p = p.Trim();

        if (!Regex.IsMatch(p, @"16:9\s*$")) p = p.TrimEnd(',', ' ') + ", 16:9";
        return p;
    }

    // ========================================================================
    //  THE AUTHOR IN THE PICTURE
    // ========================================================================
    //
    // Every piece names its writer — `personaSlug` in an article, `Artist:` in a
    // backstage fence — and every image this tool makes carries that person. Two
    // things make that happen, and both are needed:
    //
    //   1. The portrait at personas/<Name>.png is ATTACHED to the ChatGPT turn.
    //      Description alone cannot hold a consistent face across hundreds of
    //      images in twelve voices; a reference photo can.
    //   2. AuthorClause tells the model what to take from that photo and, just as
    //      importantly, what to throw away.

    /// <summary>The twelve, and the portrait filename is <c>&lt;Name&gt;.png</c>.</summary>
    private static readonly (string Slug, string Name)[] Family =
    {
        ("melody", "Melody"), ("amir", "Amir"), ("jubilee", "Jubilee"), ("elias", "Elias"),
        ("santiago", "Santiago"), ("tahoma", "Tahoma"), ("imani", "Imani"), ("caleb", "Caleb"),
        ("nova", "Nova"), ("eliana", "Eliana"), ("zariah", "Zariah"), ("zev", "Zev"),
    };

    private static string FamilyNameFor(string slug)
    {
        foreach (var p in Family) if (string.Equals(p.Slug, slug, StringComparison.OrdinalIgnoreCase)) return p.Name;
        return "";
    }

    /// <summary>
    /// The portrait file for an author slug, or null if it is not on disk.
    ///
    /// The canonical name is &lt;Name&gt;.png with the first letter capitalised, which
    /// is how the twelve are stored in this repo — no persona_ prefix, unlike the
    /// InspireManna set. The directory sweep afterwards is not belt-and-braces:
    /// this folder lives on a mapped network share whose casing is not guaranteed
    /// to survive a copy, and a case-mismatched filename would otherwise silently
    /// cost every piece that voice wrote.
    /// </summary>
    private string? ReferencePathFor(string authorSlug)
    {
        if (authorSlug.Length == 0 || !Directory.Exists(_personasRoot)) return null;
        var name = FamilyNameFor(authorSlug);
        if (name.Length == 0) return null;

        var exact = Path.Combine(_personasRoot, $"{name}.png");
        if (File.Exists(exact)) return exact;

        foreach (var ext in new[] { ".png", ".jpg", ".jpeg", ".webp" })
        {
            var wanted = name + ext;
            foreach (var f in Directory.EnumerateFiles(_personasRoot, "*" + ext))
                if (string.Equals(Path.GetFileName(f), wanted, StringComparison.OrdinalIgnoreCase)) return f;
        }
        return null;
    }

    /// <summary>
    /// A portrait as a base64 JPEG, small enough to hand to the page in one
    /// injected script.
    ///
    /// The originals are large PNGs. Injecting one of those as base64 means a
    /// multi-megabyte JavaScript string literal per turn, for no gain: the
    /// reference only has to carry a face. Cropped and downscaled to 768x768 at
    /// JPEG 88 they measure a couple of hundred KB of base64, which is a script
    /// string the page swallows without complaint. Cached, because a sweep sends
    /// the same twelve portraits dozens of times each.
    ///
    /// The centre-square crop comes first, and it is worth more than it looks. The
    /// portraits are landscape with the subject centred and the head inside the
    /// middle third, so a straight downscale spends most of its pixels on empty
    /// background and leaves the face small. Cropping to the centred square before
    /// the resize throws away only background — the same bytes, most of them now
    /// spent on the only part of the picture that is being referenced.
    ///
    /// Landscape sources only. A portrait-orientation replacement would have the
    /// head near the top, where a vertically centred square crop would cut it off.
    /// </summary>
    private string? ReferenceBase64(string path)
    {
        if (_referenceCache.TryGetValue(path, out var hit)) return hit;
        try
        {
            using var image = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(path));
            if (image.Width > image.Height)
            {
                var side = image.Height;
                var left = (image.Width - side) / 2;
                image.Mutate(x => x.Crop(new SixLabors.ImageSharp.Rectangle(left, 0, side, side)));
            }
            image.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
            {
                Mode = SixLabors.ImageSharp.Processing.ResizeMode.Max,
                Size = new SixLabors.ImageSharp.Size(ReferenceMaxEdge, ReferenceMaxEdge),
            }));
            using var ms = new MemoryStream();
            image.Save(ms, new SixLabors.ImageSharp.Formats.Jpeg.JpegEncoder { Quality = 88 });
            var b64 = Convert.ToBase64String(ms.ToArray());
            _referenceCache[path] = b64;
            return b64;
        }
        catch (Exception ex)
        {
            Log($"  ⚠ Could not read the author portrait {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    private const int ReferenceMaxEdge = 768;

    /// <summary>
    /// What the model should do with the attached portrait.
    ///
    /// ONE LINE. See AspectSuffix for why a newline here silently truncates the
    /// whole prompt.
    ///
    /// The discard list is the load-bearing half. The reference portraits are
    /// stylised studio pieces: neon-lit costume, glowing trim, circuit background,
    /// head-and-shoulders crop, subject staring down the lens. Attach one without
    /// saying what to ignore and the author walks into a country church at golden
    /// hour dressed in glowing armour, which wrecks the picture and, worse, wrecks
    /// the piece — these images have to look like the reader's own life. So the
    /// clause takes the FACE and nothing else, and hands the wardrobe decision
    /// back to the scene the prompt actually describes.
    ///
    /// The author is placed AMONG the scene rather than in front of it. The piece
    /// is for the reader and about the reader's need; an author portrait with the
    /// story behind it would invert that. Present in the room, not the subject of
    /// the photograph.
    /// </summary>
    private static string AuthorClause(string firstName) =>
        " The attached photograph is a likeness reference for one person only, named " + firstName + ". " +
        // Age deliberately NOT on this take-list any more: it is stated explicitly
        // by AgeClause, and "take the approximate age from the portrait" would put
        // the two instructions in direct contradiction.
        "Take from it ONLY the facial features, skin tone, hair colour and texture, facial hair, " +
        "and general build. " +
        "Ignore everything else about the reference photograph completely: its clothing, its glowing or " +
        "futuristic costume, its headwear, its jewellery, its neon and circuit-pattern background, its " +
        "studio lighting and its head-and-shoulders framing are all irrelevant and must not appear. " +
        "Place " + firstName + " inside the scene described above as a natural participant, present with " +
        "whoever else is in it, lit by that scene's own light and rendered in the same photographic style " +
        "as the rest of the image. " +
        "Dress " + firstName + " in ordinary real-world clothing that suits that setting, its climate and " +
        "its season, at the same level of formality as the other people present and plain enough that the " +
        "clothing draws no attention. " +
        firstName + " is part of the scene, not its subject: not centred, not posed for the camera, not " +
        "looking at the lens, and never larger or more prominent than the person the scene is about. " +
        "Do not add any name, caption, label, watermark or text anywhere in the image.";

    /// <summary>The name to use in the clause: "Caleb Inspire" becomes "Caleb".</summary>
    private static string FirstNameOf(Piece job)
    {
        var fromSlug = FamilyNameFor(job.AuthorSlug);
        if (fromSlug.Length > 0) return fromSlug;
        var parts = job.Author.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        return parts.Length > 0 ? parts[0] : "";
    }

    /// <summary>
    /// Attach the portrait to the composer and wait until the page has really
    /// taken it.
    ///
    /// Returns false rather than pressing on. That is the same rule the prompt
    /// read-back already follows: sending the turn with no reference attached
    /// would produce a perfectly good image of the wrong thing — a piece whose
    /// author is missing — and then mark it done, so it would never be
    /// regenerated. A skipped piece is recoverable; a silently author-less one
    /// that reports success is not.
    /// </summary>
    /// <param name="clearFirst">
    /// False to ADD to what is already attached. An article sends one portrait and
    /// must clear first — a leftover from the previous turn would give the model
    /// two faces to choose between. A cover sends three existing covers as a style
    /// reference, and those have to accumulate on the same turn.
    /// </param>
    private async Task<bool> AttachReference(string b64, string fileName, CancellationToken ct, bool clearFirst = true)
    {
        if (clearFirst)
        {
            await Wv.CoreWebView2.ExecuteScriptAsync(ClearAttachmentsScript());
            await Task.Delay(400, ct);
        }

        var how = Json(await Wv.CoreWebView2.ExecuteScriptAsync(AttachScript(b64, fileName)));
        if (!how.StartsWith("attached", StringComparison.Ordinal))
        {
            Log("  ✗ Could not hand the author portrait to the page (" + (how.Length > 0 ? how : "no result") + ").");
            return false;
        }
        Log($"  Attached {fileName} as the author reference ({how}).");

        // The file input accepts instantly; the upload behind it does not, and a
        // turn sent mid-upload arrives with no image attached at all.
        //
        // TWO consecutive ready polls, then a settle. The thumbnail appears the
        // moment the page decodes the local file, which is before the upload it
        // triggers has finished, so a single "ready" is not evidence that the turn
        // can be sent. Two polls a second apart plus a short wait is the cheapest
        // thing that reliably clears that gap without a progress signal the page
        // does not offer.
        var start = DateTime.UtcNow;
        var deadline = start.AddSeconds(60);
        int ready = 0;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            var state = Json(await Wv.CoreWebView2.ExecuteScriptAsync(AttachmentStateScript()));

            if (state == "ready")
            {
                if (++ready >= 2) { await Task.Delay(2500, ct); return true; }
            }
            else
            {
                ready = 0;
                // Fifteen seconds and the composer never showed a thumbnail: the
                // input took the file and dropped it on the floor.
                if (state == "none" && DateTime.UtcNow > start.AddSeconds(15))
                {
                    Log("  ✗ The page never showed the attached portrait.");
                    return false;
                }
            }
            await Task.Delay(1000, ct);
        }
        Log("  ✗ The author portrait was still uploading after 60s.");
        return false;
    }

    // ========================================================================
    //  BUTTONS AND THE BATCH DRIVER
    // ========================================================================

    // Locks the "generation location" to the page you're on — meant for your
    // ChatGPT Projects → Images page, so every generation conversation is created
    // inside that project. If you're inside a chat within the project, it
    // normalizes back to the project's new-chat page.
    private async void BtnUseLocation_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) return;
        // Read the LIVE address from the page. ChatGPT is a single-page app, so
        // CoreWebView2.Source lags behind client-side navigation (clicking a
        // project/chat in the sidebar) — window.location.href is always current.
        var src = Json(await Wv.CoreWebView2.ExecuteScriptAsync("window.location.href"));
        if (string.IsNullOrWhiteSpace(src)) src = Wv.CoreWebView2.Source ?? "";
        var m = Regex.Match(src, @"^(https://chatgpt\.com/g/g-p-[^/]+)/");
        if (m.Success) src = m.Groups[1].Value + "/project";
        if (!string.IsNullOrWhiteSpace(src)) { LocationUrl.Text = src; Log("Generation location set → " + src); }
    }

    /// <summary>
    /// The one action in the images view: generate everything still pending in
    /// whatever the selected tab covers, which is one section or, on the All tab,
    /// every section in order.
    ///
    /// The tab is the only place scope is expressed, so it cannot disagree with a
    /// second control asking the same question.
    /// </summary>
    private async void BtnGenerate_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;
        var key = SelectedKey();
        var pending = Pending(key);
        if (pending.Count == 0) { Log($"Nothing pending in {DisplayFor(key)}."); return; }
        Log($"\n=== {DisplayFor(key)}: {pending.Count} image(s) ===");
        await RunBatch(pending);
    }

    private List<Piece> Pending(string key)
    {
        if (key == AllKey)
        {
            var all = new List<Piece>();
            foreach (var s in Sections) all.AddRange(Pending(s.Key));
            return all;
        }
        return _bySection.TryGetValue(key, out var list)
            ? list.Where(a => !a.HasImage && a.Prompt.Length > 0 && !_completedPaths.Contains(a.Path)).ToList()
            : new();
    }

    private void BtnStop_Click(object sender, RoutedEventArgs e)
    {
        _cts?.Cancel();
        Log("Stopping after the current image…");
    }

    private bool EnsureReady()
    {
        if (!_ready) { Log("Browser not ready yet."); return false; }
        ReadRootFromUi();
        if (_root.Length == 0 || !Directory.Exists(_root)) { Log($"Repo root not found: {_root}"); return false; }
        return true;
    }

    /// <param name="covers">
    /// Covers reuse every line of this loop — the pacing, the escalating cooldown,
    /// the three-strikes stop, the policy handling — and differ only in which
    /// worklist gets re-rendered and what is worth saying at the end. A flag with a
    /// default keeps all three existing call sites untouched.
    /// </param>
    private async Task RunBatch(List<Piece> jobs, bool covers = false)
    {
        if (_running) { Log("Already running — press Stop first."); return; }
        _running = true;
        _cts = new CancellationTokenSource();
        SetBusy(true);
        int done = 0, skipped = 0, failed = 0, inThread = 0, consecutiveFailures = 0;
        string lastSection = "";
        try
        {
            for (int i = 0; i < jobs.Count; i++)
            {
                _cts.Token.ThrowIfCancellationRequested();
                var job = jobs[i];

                if (job.Section != lastSection)
                {
                    lastSection = job.Section;
                    Log($"\n--- {(covers ? job.Section : DisplayFor(job.Section))} ---");
                }

                // Never regenerate one already done (this session or a prior run).
                if (_completedPaths.Contains(job.Path) || job.HasImage)
                {
                    Log($"[{i + 1}/{jobs.Count}] {job.Title} — already has an image, skipping.");
                    skipped++;
                    continue;
                }

                // Start a new conversation for the first image, and a fresh one
                // after every 10 images in the current thread.
                bool newThread = inThread == 0;
                Log($"\n[{i + 1}/{jobs.Count}] {job.Title}");
                var ok = await GenerateOne(job, newThread, _cts.Token);
                if (ok)
                {
                    done++;
                    consecutiveFailures = 0;
                    _completedPaths.Add(job.Path);

                    // Tick it green now, not at the end of the run. A sweep of the
                    // whole library takes hours, and a worklist that only updates
                    // when the run finishes tells the user nothing while it runs.
                    _sessionDone.Add(job.Path);
                    // Show the image that just landed. The user is watching a long
                    // run; the picture arriving is the thing worth seeing.
                    if (covers) { RenderCovers(); ShowCoverPreview(job); }
                    else { RenderAll(); ShowPreview(job); }
                    if (++inThread >= 10)
                    {
                        Log("  Reached 10 images in this conversation — the next one starts a new thread.");
                        inThread = 0;
                    }
                    if (i < jobs.Count - 1)
                    {
                        // Image generation is far heavier than a text turn, and
                        // hammering it is what earns a "Something went wrong".
                        var wait = _rng.Next(20000, 45001);
                        Log($"  Pausing {wait / 1000.0:0.0}s before the next image…");
                        await Task.Delay(wait, _cts.Token);
                    }
                }
                else
                {
                    failed++;
                    // Three failures in a row is not bad luck. It is almost always
                    // a quota or a capacity problem, and grinding through the
                    // remaining pieces would just burn them all against the same
                    // wall and mark none of them done.
                    if (++consecutiveFailures >= 3)
                    {
                        Log("\n  ✗ Three failures in a row — stopping the run.");
                        Log("    This is usually an image quota or a temporary ChatGPT capacity problem.");
                        Log("    Nothing was lost: every piece that failed is still marked pending.");
                        break;
                    }
                    // Escalating, not flat. Two failures in a row means the wall is
                    // still there, and going back after the same 60s is how a run
                    // burns its third strike on a problem another minute would have
                    // cleared.
                    var cool = consecutiveFailures switch { 1 => 60000, 2 => 150000, _ => 240000 };
                    Log($"  Cooling down {cool / 1000}s after a failure before trying the next one…");
                    await Task.Delay(cool, _cts.Token);
                }
            }
        }
        catch (OperationCanceledException) { Log("Stopped."); }
        catch (Exception ex) { Log("Error: " + ex.Message); }
        finally
        {
            _running = false;
            SetBusy(false);
            if (covers) ScanCovers(); else ScanAll();
            Log($"\nFinished. {done} generated"
                + (failed > 0 ? $", {failed} failed" : "")
                + (skipped > 0 ? $", {skipped} skipped (already done)" : "") + ".");
            if (done > 0 && covers)
            {
                Log("Nothing here is reviewed automatically — look at every cover before it ships.");
                Log("These are MASTERS on the music drive. They are not on the site or the CDN until");
                Log("the cover publish pipeline runs (WebP → R2 → bump cover-versions.json).");
            }
            else if (done > 0)
            {
                Log("Nothing here is reviewed automatically — look at the images before these publish.");
                Log("The pages read compiled JSON: press Rebuild in Settings, or run");
                Log("    node core/articles/gen-articles.mjs");
                Log("    node app/web/scripts/gen-backstage.mjs");
            }
        }
    }

    // The outcome of a single submit-and-wait. PageFailed means ChatGPT itself
    // died on this turn, which a fresh conversation can fix. PolicyRefused means
    // the content filter rejected the PROMPT, which a fresh conversation cannot
    // fix and only a rewritten prompt can.
    private readonly record struct Attempt(string? Src, bool PageFailed, bool PolicyRefused);

    /// <summary>
    /// The author to render into one piece's image. <c>Reference</c> is null when
    /// the portrait could not be found or could not be read; combined with
    /// <c>Required</c>, that is what makes GenerateOne skip rather than generate an
    /// image with nobody in it.
    /// </summary>
    private readonly record struct AuthorRef(bool Required, string? Reference, string Base64, string FileName, string FirstName);

    private AuthorRef ResolveAuthor(Piece job)
    {
        if (ChkIncludeAuthor.IsChecked != true) return new AuthorRef(false, null, "", "", "");

        // personaSlug is the contract field, but a piece that carries only
        // `author: Caleb Inspire` still names its writer unambiguously, so the
        // first name is taken as the slug rather than failing the piece on a
        // missing field the writer simply forgot.
        var slug = job.AuthorSlug;
        if (slug.Length == 0 && job.Author.Length > 0)
            slug = job.Author.Split(' ', StringSplitOptions.RemoveEmptyEntries)[0].ToLowerInvariant();

        var path = ReferencePathFor(slug);
        if (path == null) return new AuthorRef(true, null, "", "", FirstNameOf(job));

        var b64 = ReferenceBase64(path);
        if (b64 == null) return new AuthorRef(true, null, "", "", FirstNameOf(job));

        return new AuthorRef(true, path, b64, Path.GetFileName(path), FamilyNameFor(slug));
    }

    private async Task<bool> GenerateOne(Piece job, bool newThread, CancellationToken ct)
    {
        // A cover carries no prompt until now. Building it costs one lyrics-file
        // read, which is worth paying for the album about to be generated and not
        // for the eight hundred that are not. See PrepareCover.
        if (job.Kind == Kind.Cover && !PrepareCover(job))
        {
            Log($"  ✗ Could not build a prompt: no generation brief for {job.Author} in .models.");
            return false;
        }
        if (job.Prompt.Length == 0) { Log("  ✗ No image prompt on this piece — skipping."); return false; }

        // Resolve the author BEFORE the browser is touched. A missing portrait is
        // a data problem, not a generation problem, and finding it out here costs
        // nothing — whereas finding it out after a new conversation has been
        // opened and the page has settled costs the better part of a minute per
        // piece, and there are dozens behind every absent voice.
        var author = ResolveAuthor(job);
        if (author.Required && author.Reference == null)
        {
            Log($"  ✗ No author reference for \"{(job.Author.Length > 0 ? job.Author : job.AuthorSlug)}\".");
            Log($"    Looked in: {_personasRoot}");
            Log("    Nothing sent. This piece stays queued so a later run can pick it up.");
            return false;
        }

        var first = await AttemptOne(job, newThread, job.Prompt, author, ct);
        if (first.Src != null) return await SaveImage(first.Src, job, ct);

        // The content filter refused the PROMPT. A fresh conversation cannot help,
        // because the prompt is what was rejected and it would be rejected again.
        // Rewrite it and resubmit, softening one more likely trigger each pass.
        //
        // When a rewrite finally works, the new wording is written back into the
        // ARTICLE. That matters more than it looks: imagePrompt is what the queue
        // resubmits, so a piece left holding a prompt the filter refuses would fail
        // identically on every future run, forever, and silently. A backstage
        // piece keeps its fenced prompt untouched — see WriteImagePrompt.
        if (first.PolicyRefused)
        {
            var working = job.Prompt;
            for (int pass = 1; pass <= 5; pass++)
            {
                ct.ThrowIfCancellationRequested();
                var rewritten = SanitizeForFilter(job.Prompt, pass);
                if (rewritten == working) continue;   // this pass changed nothing
                working = rewritten;

                var pause = _rng.Next(8000, 15001);
                Log($"  Content filter refused the prompt. Rewriting (pass {pass} of 5) and resubmitting in {pause / 1000}s…");
                Log($"    new prompt: {(rewritten.Length > 140 ? rewritten.Substring(0, 140) + "…" : rewritten)}");
                await Task.Delay(pause, ct);

                var retry = await AttemptOne(job, true, rewritten, author, ct);
                if (retry.Src != null)
                {
                    if (job.Kind == Kind.Article)
                    {
                        if (WriteImagePrompt(job.Path, rewritten))
                            Log($"  imagePrompt rewritten in {Path.GetFileName(job.Path)} so this piece stops failing the filter.");
                        else
                            Log($"  ⚠ Image saved, but no imagePrompt field was found to update in {Path.GetFileName(job.Path)}");
                    }
                    else if (job.Kind == Kind.Cover)
                    {
                        // A cover prompt is BUILT, not stored, so there is nothing
                        // to write back to. The next run rebuilds it from .models
                        // and the album, and would hit the same refusal — so the
                        // wording that worked is worth seeing in the log.
                        Log("  Cover prompts are built fresh each run from .models, so nothing is written back.");
                        Log("  If this album keeps tripping the filter, adjust its persona's generation brief.");
                    }
                    else
                    {
                        Log("  The rewritten wording is NOT written back: a backstage prompt lives in a fenced");
                        Log("  block with its own §8.1 annotations. Edit it there if it should stick.");
                    }
                    return await SaveImage(retry.Src, job, ct);
                }
                if (!retry.PolicyRefused)
                {
                    // It stopped being a policy problem and became something else.
                    // Escalating the rewrite would only degrade the picture.
                    Log("  The filter stopped objecting, but the turn still produced no image.");
                    break;
                }
            }
            Log("  ✗ The content filter refused every rewrite. Leaving this piece queued and untouched.");
            return false;
        }

        // A turn that died on ChatGPT's own failure banner is worth one more go,
        // but in a BRAND NEW conversation. The page's Retry button re-runs the
        // same wedged turn and tends to fail the same way; a fresh thread gets a
        // fresh one. Every other kind of miss falls straight through, because
        // resending an identical prompt would just burn another turn.
        if (first.PageFailed)
        {
            var pause = _rng.Next(30000, 60001);
            Log($"  That conversation is wedged. Starting a fresh one in {pause / 1000}s and trying this piece once more…");
            await Task.Delay(pause, ct);
            var second = await AttemptOne(job, true, job.Prompt, author, ct);
            if (second.Src != null) return await SaveImage(second.Src, job, ct);
        }
        return false;
    }

    private async Task<Attempt> AttemptOne(Piece job, bool newThread, string promptText, AuthorRef author, CancellationToken ct)
    {
        // Decided once, up front: it changes what gets attached, which clause is
        // appended and which aspect ratio is demanded.
        var cover = job.Kind == Kind.Cover;

        if (newThread)
        {
            var loc = string.IsNullOrWhiteSpace(LocationUrl.Text) ? CHATGPT : LocationUrl.Text.Trim();
            Log($"  Opening a new conversation ({loc})…");
            await NavigateAndWait(loc, ct);
        }
        else
        {
            Log("  Continuing in the same conversation…");
        }
        if (!await WaitForComposer(ct)) { Log("  ✗ Chat box never appeared — are you logged in? (composer not found)"); return new Attempt(null, false, false); }

        // The composer element exists well before the page has finished wiring up
        // its session and conversation state, and a prompt submitted into that gap
        // is the single most reliable way to earn "Something went wrong" on the
        // very first image of a run. Waiting for the box to appear is necessary and
        // is not sufficient; give the rest of the page a moment to catch up.
        if (newThread)
        {
            var settle = _rng.Next(3500, 6001);
            Log($"  Letting the page settle {settle / 1000.0:0.0}s before typing…");
            await Task.Delay(settle, ct);
        }

        // The author portrait goes on BEFORE the baseline is taken, because the
        // attachment thumbnail is itself an image on the page and would otherwise
        // read as the generated result. It also goes on before the prompt is typed:
        // ProseMirror keeps its text across an attach, but the reverse order has
        // the upload racing the send.
        if (cover)
        {
            // A cover learns its style from the persona's OWN existing covers, not
            // from the neon studio portrait. They carry the correct face, the
            // correct wardrobe, the throat token, the palette and the craft, all at
            // once — everything the text brief was trying and failing to describe.
            if (!await AttachCoverReferences(job, ct))
            {
                Log("  ✗ No style reference could be attached, so nothing was sent. This album stays queued.");
                return new Attempt(null, false, false);
            }
        }
        else if (author.Required)
        {
            if (!await AttachReference(author.Base64, author.FileName, ct))
            {
                Log($"  ✗ {author.FirstName} could not be attached, so nothing was sent. This piece stays queued.");
                return new Attempt(null, false, false);
            }
        }

        // Remember which images are already on the page so we only accept a NEW one.
        var baseline = new HashSet<string>(await GetImageList());
        Log($"  Sending prompt… ({baseline.Count} image(s) already on the page)");

        // Flatten to a single line before sending. The composer treats a newline as
        // a paragraph break and only the last paragraph survives, so any multi-line
        // prompt would arrive truncated — which is not hypothetical here: every
        // backstage prompt is a multi-line fenced block.
        //
        // Order matters at the tail: the scene, then who to put in it, then the
        // aspect ratio last, because the last instruction is the one the web UI
        // honours most reliably and a wrong ratio wastes the whole turn.
        var oneLine = Regex.Replace(promptText, @"\s+", " ").Trim();

        // Prompts end on their own trailing clause, so without this the author
        // clause would run straight on from it. Cheap to close the sentence first.
        if (oneLine.Length > 0 && !".!?".Contains(oneLine[^1])) oneLine += ".";

        // An album cover is square and the persona IS its subject, so both tail
        // clauses invert for one. See CoverAuthorClause for why sharing the
        // article clause would have been actively wrong rather than merely loose.
        // The age is stated whether or not a likeness reference went with the turn:
        // it is a fact about the persona, not a note about the attachment, and the
        // article path can have its author clause switched off.
        var who = author.FirstName.Length > 0 ? author.FirstName : FamilyNameFor(job.AuthorSlug);
        var full = oneLine
                 + (author.Required ? (cover ? CoverAuthorClause(who) : AuthorClause(who)) : "")
                 + (who.Length > 0 ? AgeClause(who) : "")
                 + (cover ? SquareSuffix : AspectSuffix);
        if (who.Length > 0) Log($"  Age: {who} is rendered at {(who.Equals("Elias", StringComparison.OrdinalIgnoreCase) ? "40, white-haired" : "30")}.");
        if (author.Required)
            Log(cover
                ? $"  Cover subject: {author.FirstName}, in the wardrobe the model file specifies."
                : $"  Author in this image: {author.FirstName}, dressed for the scene.");
        var submit = Json(await Wv.CoreWebView2.ExecuteScriptAsync(SubmitScript(full)));
        Log($"  submit result: {submit}");
        if (submit == "no-composer") { Log("  ✗ Could not find the chat box to type into."); return new Attempt(null, false, false); }
        if (submit.StartsWith("mismatch", StringComparison.Ordinal))
        {
            // Nothing was sent. Sending a fragment is worse than sending nothing:
            // it burns a turn and produces an image for the wrong description.
            Log("  ✗ The composer did not receive the full prompt, so nothing was sent.");
            return new Attempt(null, false, false);
        }

        Log("  Waiting for the image to finish generating…");
        var (src, pageFailed, policyRefused) = await WaitForNewImage(baseline, ct);
        if (src == null)
        {
            if (!pageFailed && !policyRefused)
                Log("  ✗ No finished image detected (ChatGPT may have asked a question, refused, or its layout changed).");
            return new Attempt(null, pageFailed, policyRefused);
        }
        Log("  ✓ Image finished — downloading…");
        return new Attempt(src, false, false);
    }

    // Waits for a generated image that (a) was not already present before we
    // submitted, and (b) holds the same URL across two consecutive polls — i.e.
    // generation has settled, not a streaming/placeholder frame.
    //
    // It also watches for ChatGPT's own failure state. When a turn dies with
    // "Something went wrong. Please try again." no image is ever coming, and the
    // old code could not tell that apart from a slow render: it sat out the full
    // six-minute deadline on a turn that had already failed, then reported a
    // generic timeout.
    //
    // The failure is now detected within a poll and retried on the page's own
    // Retry button with a BACKOFF. That matters more than the retry count does.
    // "Something went wrong" is overwhelmingly a capacity or rate signal, and
    // answering it by pressing Retry six seconds later is well inside the window
    // that produced the error in the first place. Backing off 20s, then 45s, then
    // 90s costs at most two and a half minutes on a genuinely dead turn and
    // rescues most of the transient ones.
    private async Task<(string? Src, bool PageFailed, bool PolicyRefused)> WaitForNewImage(HashSet<string> baseline, CancellationToken ct)
    {
        // The deadline is extended per retry, so a slow-but-alive turn is not
        // killed by time spent deliberately waiting out a backoff.
        var deadline = DateTime.UtcNow.AddMinutes(6);
        int[] backoff = { 20000, 45000, 90000 };
        string? last = null;
        int stable = 0, polls = 0, retries = 0;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();

            var current = await GetImageList();
            var newest = current.LastOrDefault(s => !baseline.Contains(s));
            if (newest != null)
            {
                if (newest == last) stable++;
                else { last = newest; stable = 1; }
                if (stable >= 2) return (newest, false, false); // unchanged across two checks → done
            }

            // The content-policy refusal, checked FIRST because it is terminal for
            // this prompt. No image is coming and no amount of waiting or retrying
            // changes that, so returning immediately saves the rest of the
            // six-minute deadline that the old code sat through.
            if (newest == null && Json(await Wv.CoreWebView2.ExecuteScriptAsync(ContentPolicyScript())) == "yes")
            {
                Log("    The content filter refused this prompt. No image is coming for this wording.");
                return (null, false, true);
            }

            // Only look for the failure banner while no image has appeared: once
            // one is rendering, a stale banner further up the thread is irrelevant.
            if (newest == null && Json(await Wv.CoreWebView2.ExecuteScriptAsync(ErrorPresentScript())) == "yes")
            {
                if (retries < backoff.Length)
                {
                    var wait = backoff[retries];
                    retries++;
                    Log($"    ChatGPT reported \"Something went wrong\" (attempt {retries} of {backoff.Length}). Waiting {wait / 1000}s, then pressing its Retry…");
                    await Task.Delay(wait, ct);
                    ct.ThrowIfCancellationRequested();
                    var clicked = Json(await Wv.CoreWebView2.ExecuteScriptAsync(ClickRetryScript()));
                    if (clicked != "clicked")
                    {
                        // The banner was there a moment ago and the button is not.
                        // Retrying a button that no longer exists is pointless.
                        Log("    The Retry button went away before it could be pressed.");
                        return (null, true, false);
                    }
                    deadline = deadline.AddMilliseconds(wait + 30000);
                    await Task.Delay(6000, ct);
                    continue;
                }
                Log($"    ✗ ChatGPT failed this turn {backoff.Length + 1} times, backing off each time.");
                return (null, true, false);
            }

            if (++polls % 5 == 0)
                Log($"    …still waiting ({current.Count} image(s) on page, ~{(int)(deadline - DateTime.UtcNow).TotalSeconds}s left)");
            await Task.Delay(3000, ct);
        }
        Log("    ✗ Timed out waiting for the image.");
        return (null, false, false);
    }

    private async Task<List<string>> GetImageList()
    {
        var r = await Wv.CoreWebView2.ExecuteScriptAsync(ListImagesScript());
        try
        {
            var arr = JsonNode.Parse(r) as JsonArray;
            return arr?.Select(x => x!.GetValue<string>()).ToList() ?? new();
        }
        catch { return new(); }
    }

    /// <summary>
    /// Fetch the image bytes inside the page (keeps the auth session), receive
    /// them via a web message, re-encode to WebP, write &lt;slug&gt;.webp into the
    /// section's images folder, and — for an article — record the filename in its
    /// `image:` field.
    ///
    /// A BACKSTAGE piece gets no write-back, and that is the correct behaviour
    /// rather than an omission: gen-backstage.mjs resolves its picture by looking
    /// the slug up on disk, so the file landing IS the record. Writing a claim
    /// into the .md as well would give the piece two sources of truth that can
    /// disagree.
    /// </summary>
    private async Task<bool> SaveImage(string src, Piece job, CancellationToken ct)
    {
        _imageMsg = new TaskCompletionSource<string>();
        await Wv.CoreWebView2.ExecuteScriptAsync(FetchScript(src));
        var b64 = await WaitForMessage(TimeSpan.FromSeconds(60), ct);
        if (b64 == null) { Log("  Failed to download the image bytes."); return false; }

        try
        {
            var original = Convert.FromBase64String(b64);
            // A cover goes to the REVIEW folder, never to the music drive. The
            // drive holds approved masters; this tool produces candidates.
            var imagesDir = job.Kind == Kind.Cover
                ? Path.GetDirectoryName(job.ReviewFile) ?? job.TargetDir
                : ImagesDirFor(job.Kind);
            Directory.CreateDirectory(imagesDir);

            byte[] bytes;
            string ext;
            if (job.Kind == Kind.Cover)
            {
                // A cover stays PNG. Every master on the music drive is PNG, and
                // the publish pipeline is what converts covers to WebP for the
                // CDN — doing it here would hand that step a lossy source and
                // leave the archive holding the worse copy of its own artwork.
                bytes = ApplyChrome(original, job, out var chromeNote);
                ext = ".png";
                if (chromeNote.Length > 0) Log("  " + chromeNote);
            }
            else
            {
                // Convert as soon as it lands. ChatGPT hands back multi-megabyte
                // PNG/JPEG; WebP is a fraction of that for the same picture, and
                // storing one format keeps every consumer from having to care which
                // extension a given piece happens to use.
                (bytes, ext) = ToWebp(original, out var note);
                if (note.Length > 0) Log("  " + note);
            }

            // A cover is named for its album title, not its code, because the
            // review folder is read by a person deciding whether to keep it.
            var fileName = job.Kind == Kind.Cover ? Path.GetFileName(job.ReviewFile) : job.Slug + ext;
            var dest = Path.Combine(imagesDir, fileName);
            await File.WriteAllBytesAsync(dest, bytes, ct);

            // Remove a previous render of this piece in another format, or the
            // folder accumulates an orphan .jpg beside every new .webp — and for a
            // backstage piece a stale .jpg would actually WIN, because
            // gen-backstage.mjs searches .webp then .jpg and takes the first hit
            // on disk without asking which is newer.
            //
            // Skipped for covers: they are named by title, so there is no
            // slug-keyed sibling to supersede, and a review folder is somewhere a
            // person may have deliberately kept an earlier take to compare.
            if (job.Kind != Kind.Cover)
            {
                foreach (var stale in StaleSiblings(imagesDir, job.Slug, fileName))
                {
                    try { File.Delete(stale); Log($"  Removed superseded {Path.GetFileName(stale)}"); }
                    catch { /* not worth failing the save over */ }
                }
            }

            if (job.Kind == Kind.Article)
            {
                if (!WriteImageField(job.Path, fileName))
                {
                    Log($"  ⚠ Wrote {dest} but could not record it in {Path.GetFileName(job.Path)} (no frontmatter?)");
                    return false;
                }
                Log($"  image recorded in {Path.GetFileName(job.Path)}");
            }
            else if (job.Kind == Kind.Cover)
            {
                Log("  Cover: written to review/ for approval. NOT on the music drive.");
            }
            else
            {
                Log("  Backstage: the file on disk is the record — gen-backstage.mjs finds it by slug.");
            }

            // A cover is NOT marked as having artwork: it has a candidate awaiting
            // approval, which is a different thing. Setting ImageFile here would
            // claim the album is covered on the music drive, and the next scan
            // would agree with a claim that is not true on disk.
            if (job.Kind == Kind.Cover) job.AwaitingReview = true;
            else job.ImageFile = fileName;

            var saved = original.Length > 0 ? 100 - (int)(bytes.LongLength * 100 / original.LongLength) : 0;
            var where = job.Kind switch
            {
                Kind.Article => "images/articles",
                Kind.Cover => "review/" + Path.GetFileName(imagesDir),
                _ => "images/backstage",
            };
            Log($"  Saved {where}/{fileName}  ({bytes.Length:N0} bytes"
                + (ext == WebpExt ? $", {saved}% smaller than the {original.Length:N0} byte original)" : ")"));
            return true;
        }
        catch (Exception ex)
        {
            Log("  ✗ Could not save the image: " + ex.Message);
            return false;
        }
    }

    // ---- image conversion --------------------------------------------------

    private const string WebpExt = ".webp";

    /// <summary>
    /// WebP quality for saved images. 82 is visually indistinguishable from the
    /// source on photographic content and lands around a tenth of the bytes;
    /// higher buys nothing a reader can see.
    /// </summary>
    private const int WebpQuality = 82;

    /// <summary>
    /// Re-encode a downloaded image as WebP.
    ///
    /// Falls back to the original bytes, under their true extension, if the encode
    /// fails or comes out no smaller. Losing a generated image to a conversion
    /// problem would cost a GPU render and silently drop the piece out of the
    /// queue, so the original always wins over nothing.
    /// </summary>
    /// <returns>The bytes to write and the extension to write them under.</returns>
    private static (byte[] Bytes, string Ext) ToWebp(byte[] source, out string note)
    {
        note = "";
        try
        {
            using var image = SixLabors.ImageSharp.Image.Load(source);
            using var ms = new MemoryStream();
            image.Save(ms, new SixLabors.ImageSharp.Formats.Webp.WebpEncoder
            {
                Quality = WebpQuality,
                FileFormat = SixLabors.ImageSharp.Formats.Webp.WebpFileFormatType.Lossy,
            });
            var webp = ms.ToArray();

            if (webp.Length == 0 || webp.Length >= source.Length)
            {
                note = $"WebP came out {webp.Length:N0} bytes vs {source.Length:N0} original; keeping the original.";
                return (source, SniffExtension(source));
            }
            return (webp, WebpExt);
        }
        catch (Exception ex)
        {
            note = "WebP conversion failed (" + ex.Message + "); saving the original instead.";
            return (source, SniffExtension(source));
        }
    }

    /// <summary>
    /// The real extension for a byte buffer, from its magic number. Never trust
    /// the URL: ChatGPT serves these from blob/CDN paths that carry no format.
    /// </summary>
    private static string SniffExtension(byte[] b)
    {
        if (b.Length >= 8 && b[0] == 0x89 && b[1] == 0x50 && b[2] == 0x4E && b[3] == 0x47) return ".png";
        if (b.Length >= 3 && b[0] == 0xFF && b[1] == 0xD8 && b[2] == 0xFF) return ".jpg";
        if (b.Length >= 12
            && b[0] == 'R' && b[1] == 'I' && b[2] == 'F' && b[3] == 'F'
            && b[8] == 'W' && b[9] == 'E' && b[10] == 'B' && b[11] == 'P') return WebpExt;
        return ".jpg";
    }

    /// <summary>
    /// Other renders of the same piece sitting beside the one just written — a
    /// `.jpg` left over from before the WebP switch, for instance.
    /// </summary>
    private static IEnumerable<string> StaleSiblings(string imagesDir, string slug, string keep)
    {
        foreach (var ext in new[] { ".jpg", ".jpeg", ".png", WebpExt })
        {
            var name = slug + ext;
            if (string.Equals(name, keep, StringComparison.OrdinalIgnoreCase)) continue;
            var path = Path.Combine(imagesDir, name);
            if (File.Exists(path)) yield return path;
        }
    }

    // ---- navigation + messaging helpers ------------------------------------
    // Best-effort navigation: waits for the "completed" event but never hangs on
    // it — after the timeout it proceeds, and WaitForComposer confirms the page is
    // actually usable.
    private async Task NavigateAndWait(string url, CancellationToken ct)
    {
        var tcs = new TaskCompletionSource<bool>();
        void handler(object? s, CoreWebView2NavigationCompletedEventArgs e) => tcs.TrySetResult(e.IsSuccess);
        Wv.CoreWebView2.NavigationCompleted += handler;
        try
        {
            Wv.CoreWebView2.Navigate(url);
            await Task.WhenAny(tcs.Task, Task.Delay(25000, ct));
        }
        catch (OperationCanceledException) { }
        finally
        {
            Wv.CoreWebView2.NavigationCompleted -= handler;
        }
    }

    private async Task<bool> WaitForComposer(CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddSeconds(40);
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            if (Json(await Wv.CoreWebView2.ExecuteScriptAsync(ComposerPresentScript())) == "yes") return true;
            await Task.Delay(1000, ct);
        }
        return false;
    }

    private void OnWebMessage(object? sender, CoreWebView2WebMessageReceivedEventArgs e)
    {
        try
        {
            var text = e.TryGetWebMessageAsString();
            var node = JsonNode.Parse(text);
            var type = node?["type"]?.GetValue<string>();
            if (type == "image") _imageMsg?.TrySetResult(node!["b64"]!.GetValue<string>());
            else if (type == "error") { Log("  page fetch error: " + node?["message"]?.GetValue<string>()); _imageMsg?.TrySetResult(""); }
        }
        catch { /* ignore malformed messages from the page */ }
    }

    private async Task<string?> WaitForMessage(TimeSpan timeout, CancellationToken ct)
    {
        var msg = _imageMsg!;
        var completed = await Task.WhenAny(msg.Task, Task.Delay(timeout, ct));
        if (completed == msg.Task)
        {
            var v = await msg.Task;
            return string.IsNullOrEmpty(v) ? null : v;
        }
        return null;
    }

    // ---- injected scripts --------------------------------------------------
    private static string J(string s) => JsonSerializer.Serialize(s);

    // True when the newest turn carries ChatGPT's failure banner. Anchored to a
    // visible Retry button rather than to the phrase alone, so an old failure
    // scrolled further up the conversation cannot trigger a false positive.
    private static string ErrorPresentScript() =>
        "(function(){var b=document.querySelectorAll('button');" +
        "for(var i=b.length-1;i>=0;i--){var t=(b[i].innerText||'').trim();" +
        "if(/^retry$/i.test(t)){var r=b[i].getBoundingClientRect();" +
        "if(r.width>0&&r.height>0)return 'yes';}}" +
        "return 'no';})();";

    // True when the page is showing a CONTENT POLICY refusal.
    //
    // This is a different failure from "Something went wrong", and the difference
    // is why it needed its own detector: the policy refusal ships no Retry button,
    // so ErrorPresentScript never fires on it and the old code sat out the entire
    // six-minute deadline on a turn that was already dead. Worse, retrying the
    // identical prompt could not have helped, because the prompt is the problem.
    //
    // Matched on the message text near the end of the thread rather than anywhere
    // on the page, so a refusal scrolled further up cannot trigger a false hit.
    private static string ContentPolicyScript() =>
        "(function(){var t=(document.body.innerText||'');" +
        "var tail=t.slice(-1800).toLowerCase();" +
        "var pats=['violate our content polic','content policies','this request may violate'," +
        "'i can\\u2019t create that image','i cannot create that image','i can\\u2019t generate that image'," +
        "'unable to generate that image','against our usage policies','flagged by our safety system'," +
        "'i\\u2019m not able to create','i am not able to create'];" +
        "for(var i=0;i<pats.length;i++){if(tail.indexOf(pats[i])>=0)return 'yes';}" +
        "return 'no';})();";

    private static string ClickRetryScript() =>
        "(function(){var b=document.querySelectorAll('button');" +
        "for(var i=b.length-1;i>=0;i--){var t=(b[i].innerText||'').trim();" +
        "if(/^retry$/i.test(t)){b[i].click();return 'clicked';}}" +
        "return 'none';})();";

    private static string ComposerPresentScript() =>
        "(function(){var b=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');return b?'yes':'no';})();";

    // Types the prompt into the composer and sends it, but only after reading the
    // composer back and confirming it actually holds what we meant to send.
    //
    // The read-back is the important part. Without it, a composer that silently
    // dropped or mangled the text still got Enter pressed, and ChatGPT received a
    // fragment. That failure was invisible: the old script returned the string
    // 'submitted' whether or not the text had survived. It now refuses to press
    // send on a mismatch and hands the actual composer contents back for the log.
    private static string SubmitScript(string prompt) =>
        "(function(){var P=" + J(prompt) + ";" +
        "var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "if(!box)return 'no-composer';box.focus();" +
        "try{document.execCommand('selectAll',false,null);document.execCommand('insertText',false,P);}catch(e){}" +
        "var read=function(){return (box.innerText||box.textContent||'').replace(/\\s+/g,' ').trim();};" +
        "var got=read();" +
        "if(got.length===0){try{box.textContent=P;got=read();}catch(e){}}" +
        "box.dispatchEvent(new Event('input',{bubbles:true}));" +
        "var head=P.slice(0,40).replace(/\\s+/g,' ').trim();" +
        "if(got.indexOf(head)!==0)return 'mismatch|want:'+head+'|got:'+got.slice(0,90);" +
        "setTimeout(function(){var btn=document.querySelector('button[data-testid=\"send-button\"]')||document.querySelector('button[aria-label=\"Send prompt\"]');" +
        "if(btn){btn.click();}else{box.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));}},450);" +
        "return 'submitted|'+got.length+' chars';})();";

    // Returns every finished, LARGE image on the page, in DOM order (last = most
    // recent). We detect by size rather than URL: ChatGPT serves generated images
    // from signed URLs that don't match any fixed pattern, but the generated image
    // is always the big, fully-loaded one — UI chrome (avatars, icons, inline
    // SVGs) is small and gets filtered out by the size gate.
    //
    // USER TURNS AND THE COMPOSER ARE EXCLUDED, and that exclusion is load-bearing
    // now that every turn carries an attached author portrait. The portrait is a
    // 768px raster, so it clears the size gate comfortably; once the turn is sent
    // it renders again inside the user's own message bubble under a fresh URL that
    // is not in the baseline. Without this filter it would be the newest unseen
    // image on the page for as long as the generated one took to render, hold
    // still across two polls, and be saved as the piece's hero image — a piece
    // illustrated with a neon studio portrait of its own author.
    //
    // The filter fails OPEN. If ChatGPT drops the data-message-author-role
    // attribute the closest() calls simply stop matching and this behaves exactly
    // as it did before, rather than finding no images at all and failing shut.
    private static string ListImagesScript() =>
        "(function(){var out=[];var imgs=document.querySelectorAll('img');" +
        "for(var i=0;i<imgs.length;i++){var im=imgs[i];var s=im.currentSrc||im.src||'';" +
        "if(!s||s.indexOf('data:image/svg')===0)continue;" +
        "try{if(im.closest('[data-message-author-role=\"user\"]'))continue;" +
        "if(im.closest('form'))continue;}catch(e){}" +
        "if(im.complete&&(im.naturalWidth||0)>=400&&(im.naturalHeight||0)>=400){out.push(s);}}" +
        "return out;})();";

    // ---- attaching the author portrait -------------------------------------

    // Hands the portrait to the page as a real File.
    //
    // Two routes, tried in order, because ChatGPT's composer has changed shape
    // more than once and both have been the working one at different times:
    //
    //   1. The composer's hidden <input type=file>. Set .files from a DataTransfer
    //      and dispatch a bubbling 'change' — React listens for the native event at
    //      the document root, so this reaches its onChange handler the same way a
    //      real file picker would. Inputs advertising image/ are preferred: a page
    //      can carry others (avatar, data import) and the first one found is not
    //      necessarily the composer's.
    //   2. A synthetic paste carrying the same DataTransfer. ProseMirror handles
    //      pasted image data itself, which is the path a user takes with Ctrl+V.
    //
    // No drag-and-drop fallback. A synthetic dragover/drop pair is the least
    // reliable of the three and the hardest to tell "silently ignored" from
    // "accepted", and a silent miss here is exactly the failure this whole path
    // exists to prevent.
    private static string AttachScript(string b64, string fileName) =>
        "(function(){var B=" + J(b64) + ";var N=" + J(fileName) + ";" +
        "try{" +
        "var bin=atob(B);var arr=new Uint8Array(bin.length);" +
        "for(var i=0;i<bin.length;i++)arr[i]=bin.charCodeAt(i);" +
        "var file=new File([arr],N,{type:'image/jpeg'});" +
        "var dt=new DataTransfer();dt.items.add(file);" +
        "var ins=Array.prototype.slice.call(document.querySelectorAll('input[type=\"file\"]'));" +
        "ins.sort(function(a,b){var ai=((a.getAttribute('accept')||'').indexOf('image')>=0)?0:1;" +
        "var bi=((b.getAttribute('accept')||'').indexOf('image')>=0)?0:1;return ai-bi;});" +
        "for(var j=0;j<ins.length;j++){try{ins[j].files=dt.files;" +
        "if(ins[j].files&&ins[j].files.length===1){" +
        "ins[j].dispatchEvent(new Event('change',{bubbles:true}));return 'attached|input';}}catch(e){}}" +
        "var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "if(box){box.focus();" +
        "box.dispatchEvent(new ClipboardEvent('paste',{bubbles:true,cancelable:true,clipboardData:dt}));" +
        "return 'attached|paste';}" +
        "return 'no-target';}catch(e){return 'error|'+String(e);}})();";

    // Drops anything already pinned to the composer. Scoped to the composer's own
    // form so a "Remove" control belonging to some other part of the page is left
    // alone.
    private static string ClearAttachmentsScript() =>
        "(function(){var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "var form=box?box.closest('form'):null;if(!form)return 'cleared|0';" +
        "var n=0;var bs=form.querySelectorAll('button[aria-label]');" +
        "for(var i=0;i<bs.length;i++){var a=(bs[i].getAttribute('aria-label')||'').toLowerCase();" +
        "if(a.indexOf('remove')>=0||a.indexOf('delete')>=0){try{bs[i].click();n++;}catch(e){}}}" +
        "return 'cleared|'+n;})();";

    // 'ready' | 'uploading' | 'none' — whether the composer is showing the
    // attachment.
    //
    // Honest about its limits: ChatGPT does not expose "the upload finished" in
    // any stable way, so this reads the preview thumbnail instead — present and
    // decoded means the page has the file. The caller compensates by requiring the
    // state twice in a row and then waiting a beat, rather than trusting one poll.
    //
    // Scoped to the composer's form, and returns 'none' when there is no form to
    // scope to. Widening to the whole document instead would count the avatar in
    // the corner as an attachment and report ready when nothing was attached at
    // all, which is the one wrong answer that costs a piece its author.
    private static string AttachmentStateScript() =>
        "(function(){var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "var form=box?box.closest('form'):null;if(!form)return 'none';" +
        "if(form.querySelector('[role=\"progressbar\"]'))return 'uploading';" +
        "var imgs=form.querySelectorAll('img');var found=0,loading=0;" +
        "for(var i=0;i<imgs.length;i++){var im=imgs[i];var s=im.currentSrc||im.src||'';" +
        "if(!s||s.indexOf('data:image/svg')===0)continue;" +
        "var r=im.getBoundingClientRect();if(r.width<8||r.height<8)continue;" +
        "found++;if(!im.complete||(im.naturalWidth||0)===0)loading++;}" +
        "if(found===0)return 'none';return loading>0?'uploading':'ready';})();";

    private static string FetchScript(string src) =>
        "(function(){var SRC=" + J(src) + ";" +
        "fetch(SRC).then(function(r){return r.arrayBuffer();}).then(function(buf){var b=new Uint8Array(buf);var bin='';var c=0x8000;" +
        "for(var i=0;i<b.length;i+=c){bin+=String.fromCharCode.apply(null,b.subarray(i,i+c));}" +
        "window.chrome.webview.postMessage(JSON.stringify({type:'image',b64:btoa(bin)}));})" +
        ".catch(function(e){window.chrome.webview.postMessage(JSON.stringify({type:'error',message:String(e)}));});return 'fetching';})();";

    // ExecuteScriptAsync returns a JSON-encoded value; decode string results.
    private static string Json(string result)
    {
        try { return JsonSerializer.Deserialize<string>(result) ?? ""; }
        catch { return ""; }
    }

    private static readonly Random _rng = new();

    // ---- ui plumbing -------------------------------------------------------
    private void SetBusy(bool busy)
    {
        BtnGenerate.IsEnabled = !busy;
        BtnScan.IsEnabled = !busy;
        BtnStop.IsEnabled = busy;
        // Both views drive the same browser and the same runner, so a run started
        // in either has to lock both Generate buttons. Leaving the covers one live
        // during an article sweep would let a second batch start against a page
        // already mid-generation, and RunBatch would refuse it — after the user
        // had every reason to think it had begun.
        BtnCoversGenerate.IsEnabled = !busy;
        BtnCoversRefresh.IsEnabled = !busy;
        BtnCoversStop.IsEnabled = busy;
        // Tabs stay live while busy so the worklist can be read during a run.
        // Scope was fixed when Generate was pressed, so changing tabs mid-run
        // cannot redirect it.
    }

    private void Log(string msg)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(() => Log(msg)); return; }
        LogBox.AppendText(msg + "\n");
        LogBox.ScrollToEnd();
    }

    /// <summary>
    /// One imageable piece, from either source tree. Only the fields this tool
    /// acts on: the compilers read everything else and this has no business
    /// carrying a copy of it.
    /// </summary>
    private class Piece
    {
        public string Path = "";          // absolute path to the .md
        public string Slug = "";
        public string Section = "";       // the section key it was scanned from
        public Kind Kind;
        public string Title = "";
        public string Author = "";        // "Caleb Inspire"
        public string AuthorSlug = "";    // "caleb" — picks the reference portrait
        public string Prompt = "";
        public string ImageFile = "";     // bare filename; "" means pending
        public bool HasImage => ImageFile.Length > 0;

        // ---- covers only -------------------------------------------------
        /// Where the finished picture belongs. Empty for an article or a
        /// backstage piece, whose folder is decided by Kind alone; a cover's is
        /// its own album's artwork/ folder, so it has to travel with the job.
        public string TargetDir = "";
        /// The album folder, for the covers worklist and the log.
        public string AlbumDir = "";
        /// <summary>
        /// Where a GENERATED cover is written: review/&lt;Persona&gt;/&lt;Title&gt; (CODE).png.
        /// Full path, filename included, because the review name is the album's
        /// title rather than its code and cannot be derived from Slug.
        ///
        /// Nothing this tool generates lands on the music drive. It goes here to
        /// be looked at first, and is moved across by hand once approved.
        /// </summary>
        public string ReviewFile = "";
        /// True when a file is already sitting in review for this album.
        public bool AwaitingReview;
        /// <summary>
        /// Which of the four draft angles this job is. One album expands into four
        /// jobs at queue time — one interpretation of a title is a coin toss, and
        /// four different angles mean the dead-but-clever reading is one of four
        /// rather than the only one.
        /// </summary>
        public int Variant;
    }
}
