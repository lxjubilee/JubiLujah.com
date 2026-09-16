using System.IO;
using System.Text;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using SixLabors.ImageSharp.Processing;

namespace JubileeCoverArtStudio;

// ============================================================================
//  ALBUM COVERS
// ============================================================================
//
// Finds albums on the music drive with no artwork/<CODE>.png, builds each one a
// prompt from its persona's model file in .models plus the album's own content,
// and generates the picture through the browser on the left.
//
// Ported from wpf/CoverImages.cs (JubileePraise Studio). The reasoning below is
// that file's and is kept verbatim where it still applies, because every line of
// it is a measured result rather than a preference.
//
// WHY THIS IS NOT JUST THE IMAGE STUDIO POINTED AT AN ALBUM FOLDER.
//
//   1. A cover is SQUARE and the persona IS its subject, centred right of frame
//      with the left third kept calm for the wordmark. See CoverAuthorClause.
//
//   2. THE PICTURE COMES BACK WITH NO WORDS ON IT, and the app draws the chrome
//      itself. Every cover in the catalogue carries a border, the persona's name
//      in script up the left edge, and the album title along the bottom. Asking a
//      model to letter that is how AMIM1001EN ended up publishing "BRIDGE ACROSS
//      FAITHS" over an album that was renamed months ago: the words are baked into
//      the pixels, so no text search finds them and no rename touches them.
//      ApplyChrome draws the title from the album's OWN meta file, every time.
//
//   3. The prompt is BUILT, never stored. There is no cover .md to hold one, and
//      there should not be: .models is the source of truth for how a persona's
//      covers look, and a copy in a second place would be free to drift from it.
//
// 🔴 NOTHING THIS VIEW GENERATES GOES TO THE MUSIC DRIVE. The drive holds
// approved masters; this produces candidates. A candidate that wrote itself
// straight into artwork/ would be indistinguishable from an approved one the
// moment it landed — and would mark the album covered, so it would never be
// offered again.

public partial class MainWindow
{
    /// <summary>Album folders with a cover job attached, for the current filter.</summary>
    private readonly List<Job> _covers = new();

    /// <summary>
    /// Parsed generation briefs, keyed by voice folder ("melody-inspire").
    /// Re-read on Refresh rather than cached for the session: .models is a working
    /// document, and editing a brief then pressing Refresh should change the next
    /// image rather than require restarting the app.
    /// </summary>
    private readonly Dictionary<string, string> _briefs = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Lyric-derived one-line themes and genre pairs, keyed by album code.</summary>
    private readonly Dictionary<string, string> _themes = new(StringComparer.OrdinalIgnoreCase);
    private readonly Dictionary<string, string> _genres = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Where the twelve model files live.</summary>
    private string ModelsRoot => Path.Combine(_root, ".models");

    /// <summary>Where generated covers land, one folder per persona.</summary>
    private string ReviewRoot => Path.Combine(_root, "review");

    /// <summary>
    /// review/&lt;Persona Name&gt;/&lt;Album Title&gt; (CODE) - N.png
    ///
    /// Title first because the folder is read by a person deciding what to keep;
    /// the code kept in brackets because it is how every other part of the system
    /// identifies the album, and an approved file has to be placeable back.
    /// </summary>
    private string ReviewDirFor(string voice) => Path.Combine(ReviewRoot, FileSafe(VoiceDisplay(voice)));

    /// <param name="draft">1-based draft number. Four drafts land side by side.</param>
    private string ReviewPathFor(string voice, string code, string title, int draft) =>
        Path.Combine(ReviewDirFor(voice), $"{FileSafe(title)} ({code}) - {draft}.png");

    /// <summary>
    /// Any draft already sitting in review for this album, whatever its number.
    /// One is enough to stop the album being queued again — the point of review is
    /// that a person decides, and generating over an undecided draft wastes it.
    /// </summary>
    private bool AnyDraftInReview(string voice, string code, string title)
    {
        var dir = ReviewDirFor(voice);
        if (!Directory.Exists(dir)) return false;
        try { return Directory.EnumerateFiles(dir, $"{FileSafe(title)} ({code})*.png").Any(); }
        catch { return false; }
    }

    // ========================================================================
    //  THE PICKER AND THE FILTERS
    // ========================================================================

    /// <summary>
    /// False until the constructor has finished. Filling the persona picker sets
    /// SelectedIndex and fires the handler while the window is still being built,
    /// and scanning the whole music drive from inside the constructor would delay
    /// every launch — including the ones that never open this view.
    ///
    /// Deliberately NOT _ready, which means "the browser has initialised". The
    /// scan reads folders; it has nothing to do with the browser, and gating it on
    /// one would leave the view empty for anyone who opened it before ChatGPT
    /// finished loading.
    /// </summary>
    private bool _coverUiBuilt;

    private void FillCoverPersonaPicker()
    {
        if (CmbCoverPersona == null) return;
        var was = _coverUiBuilt;
        _coverUiBuilt = false;              // filling it fires SelectionChanged
        CmbCoverPersona.Items.Clear();
        CmbCoverPersona.Items.Add(new ComboBoxItem { Content = "All personas", Tag = "" });
        if (Directory.Exists(EffectiveMusicRoot))
        {
            foreach (var dir in Directory.EnumerateDirectories(EffectiveMusicRoot).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                var name = Path.GetFileName(dir);
                if (name.StartsWith('_') || name.StartsWith('.')) continue;
                if (!VoiceAllowed(name)) continue;   // the header's tenant picker
                CmbCoverPersona.Items.Add(new ComboBoxItem { Content = VoiceDisplay(name), Tag = name });
            }
        }
        CmbCoverPersona.SelectedIndex = 0;
        _coverUiBuilt = was;
    }

    private string SelectedCoverVoice() => (CmbCoverPersona?.SelectedItem as ComboBoxItem)?.Tag as string ?? "";

    private void CmbCoverPersona_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_coverUiBuilt) return;
        ScanCovers();
    }

    private void BtnCoversRefresh_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        _briefs.Clear();          // pick up edits to .models without a restart
        _alreadyUsed.Clear();     // and to the per-album register it reads
        _exemplars.Clear();       // and any cover approved into artwork/ since
        _themes.Clear();
        _genres.Clear();
        _sessionDone.Clear();
        _completedPaths.Clear();
        _usedThisRun.Clear();
        ScanCovers();
    }

    private void ChkCoversShowAll_Click(object sender, RoutedEventArgs e) => RenderCovers();

    /// <summary>
    /// Language scope, so it re-SCANS rather than re-rendering.
    ///
    /// That distinction matters. "Show albums that already have artwork" is a
    /// display switch and filters in RenderCovers, because Generate independently
    /// targets only the ones without a cover and cannot disagree with it. This one
    /// decides which albums are in scope at all, and if it filtered at render time
    /// the list would hide the localised editions while Generate quietly swept them
    /// anyway — the worklist saying one thing and the button doing another.
    /// </summary>
    private void ChkCoversEnglishOnly_Click(object sender, RoutedEventArgs e)
    {
        if (!_coverUiBuilt) return;
        ScanCovers();
    }

    /// <summary>
    /// True when an album is English — which is either an explicit EN suffix or
    /// NO LANGUAGE SUFFIX AT ALL.
    ///
    /// The code is &lt;PREFIX&gt;&lt;NNNN&gt;&lt;LANG&gt; — MDIM1042EN, AMIM1034RO,
    /// IMIM1034KO — so the last two characters are the language WHEN THERE ARE
    /// TWO. Some codes carry none and end on their number instead.
    ///
    /// THE SECOND CLAUSE IS NOT DEFENSIVE, IT IS LOAD-BEARING. Requiring the EN
    /// suffix hid every suffix-less album, and the whole of MyTinyTiggles is
    /// suffix-less: the Covers view for that tenant reported "0 English album(s)"
    /// and showed an empty list. Those albums were never localised; they simply
    /// never carried a tag.
    ///
    /// Measured across the whole music drive, 2026-08-17 — 1052 album codes: 839
    /// end in EN, 179 end in one of 39 other language tags, and 34 end on a digit.
    /// No real language tag ends in a digit, so the test is exact rather than a
    /// heuristic: a trailing digit means the code has no language field.
    /// </summary>
    private static bool IsEnglishAlbum(string code) =>
        code.Length >= 2
        && (char.IsDigit(code[^1]) || code.EndsWith("EN", StringComparison.OrdinalIgnoreCase));

    /// <summary>
    /// Opens whichever folder is the one you actually want: the review folder when
    /// there is something in it to look at, the album folder otherwise.
    /// </summary>
    private void BtnCoversOpen_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedCover() is not { } p || p.AlbumDir.Length == 0) { Log("Select an album first."); return; }
        var target = p.AwaitingReview && File.Exists(p.OutFile)
            ? Path.GetDirectoryName(p.OutFile)!
            : p.AlbumDir;
        Open(target);
    }

    private void BtnReviewOpen_Click(object sender, RoutedEventArgs e)
    {
        var voice = SelectedCoverVoice();
        var target = voice.Length > 0 ? ReviewDirFor(voice) : ReviewRoot;
        if (!Directory.Exists(target)) target = ReviewRoot;
        if (!Directory.Exists(target)) { Log($"Nothing in review yet — {ReviewRoot} does not exist."); return; }
        Open(target);
    }

    // ========================================================================
    //  THE SCAN
    // ========================================================================

    /// <summary>
    /// Every album under the selected persona (or all of them), and whether it
    /// already has artwork.
    ///
    /// Deliberately CHEAP. Nothing on this list needs the lyrics — only the
    /// folder, the meta title, and whether artwork/ has a picture in it. Opening
    /// every album's lyrics file here measured 8.2 seconds for one persona's 148
    /// albums in the sibling tool, and doing it for all twelve voices would lock
    /// the window for a minute every time this view was opened. The lyrics are
    /// read once, for one album, at the moment its prompt is built.
    /// </summary>
    private void ScanCovers()
    {
        _covers.Clear();
        if (_root.Length == 0 || !Directory.Exists(EffectiveMusicRoot))
        {
            Log($"Music root not found: {EffectiveMusicRoot}");
            Log("  Set it in Settings. 🔴 J:\\jubileepraise.com\\ was created empty by the rename —");
            Log("  the catalogue is still under J:\\jubilujah.com\\music. See CLAUDE.md.");
            RenderCovers();
            return;
        }

        var only = SelectedCoverVoice();
        var voices = Directory.EnumerateDirectories(EffectiveMusicRoot)
            .Select(Path.GetFileName)
            .Where(n => n is { Length: > 0 } && !n.StartsWith('_') && !n.StartsWith('.'))
            .Where(VoiceAllowed)
            .Where(n => only.Length == 0 || string.Equals(n, only, StringComparison.OrdinalIgnoreCase))
            .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var englishOnly = ChkCoversEnglishOnly?.IsChecked != false;

        int missing = 0, have = 0, skippedLang = 0, waiting = 0;
        foreach (var voice in voices)
        {
            var voiceDir = Path.Combine(EffectiveMusicRoot, voice!);
            foreach (var dir in Directory.EnumerateDirectories(voiceDir).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                var folder = Path.GetFileName(dir);
                if (folder.StartsWith('_') || folder.StartsWith('.')) continue;

                var code = folder.Split('-', 2)[0];
                if (englishOnly && !IsEnglishAlbum(code)) { skippedLang++; continue; }

                var artDir = Path.Combine(dir, "artwork");
                var existing = ExistingCover(artDir, code);
                var title = AlbumTitleOf(dir, folder);
                var inReview = existing.Length == 0 && AnyDraftInReview(voice!, code, title);
                if (existing.Length > 0) have++; else missing++;
                if (inReview) waiting++;

                _covers.Add(new Job
                {
                    Path = dir,                    // the completion key for the ALBUM
                    Kind = Kind.Cover,
                    AlbumDir = dir,
                    ArtworkDir = artDir,
                    OutFile = ReviewPathFor(voice!, code, title, 1),
                    AwaitingReview = inReview,
                    Code = code,
                    Title = $"{code} · {title}",
                    Artist = VoiceDisplay(voice!),
                    ImageFile = existing,
                    // Built at generation time, not now: it costs a lyrics-file
                    // read per album and almost none of these will be generated
                    // this session.
                    Prompt = "",
                });
            }
        }

        Log($"Covers: {_covers.Count} {(englishOnly ? "English " : "")}album(s) under "
            + $"{(only.Length == 0 ? "all personas" : VoiceDisplay(only))} — "
            + $"{missing} with no artwork, {have} already covered."
            + (waiting > 0 ? $"  {waiting} awaiting your review." : "")
            + (skippedLang > 0 ? $"  ({skippedLang} localised edition(s) hidden.)" : ""));
        if (missing > 0 && !Directory.Exists(ModelsRoot))
            Log($"  ⚠ .models not found at {ModelsRoot} — generation needs it and will refuse without it.");

        RenderCovers();
    }

    /// <summary>
    /// The cover file for an album code, or "" when there is none.
    ///
    /// Any of the four extensions counts as covered. A folder holding
    /// &lt;CODE&gt;.jpg is not missing its artwork, and queueing it would overwrite
    /// a real master with a fresh guess.
    /// </summary>
    private static string ExistingCover(string artDir, string code)
    {
        if (!Directory.Exists(artDir)) return "";
        foreach (var ext in new[] { ".png", ".jpg", ".jpeg", ".webp" })
        {
            var f = Path.Combine(artDir, code + ext);
            if (File.Exists(f)) return Path.GetFileName(f);
        }
        // Casing on a mapped share is not guaranteed to survive a copy, and a
        // case-mismatched name would have this generate over a cover that exists.
        try
        {
            foreach (var f in Directory.EnumerateFiles(artDir))
            {
                var name = Path.GetFileNameWithoutExtension(f);
                if (string.Equals(name, code, StringComparison.OrdinalIgnoreCase)) return Path.GetFileName(f);
            }
        }
        catch { /* an unreadable artwork folder reads as "no cover" */ }
        return "";
    }

    private static string AlbumTitleOf(string dir, string folder)
    {
        try
        {
            var meta = Path.Combine(dir, "album.meta.json");
            if (File.Exists(meta))
            {
                var t = JsonNode.Parse(File.ReadAllText(meta))?["album_title"]?.GetValue<string>();
                if (!string.IsNullOrWhiteSpace(t)) return t!;
            }
        }
        catch { /* the folder name is a perfectly good label */ }
        var slug = folder.Contains('-') ? folder.Split('-', 2)[1] : folder;
        return slug.Replace('-', ' ');
    }

    // ========================================================================
    //  THE WORKLIST
    // ========================================================================

    private void RenderCovers()
    {
        if (LstCovers == null) return;
        var showAll = ChkCoversShowAll?.IsChecked == true;

        var rows = new List<Row>();
        foreach (var p in _covers)
        {
            var fresh = _sessionDone.Contains(p.Path) || _sessionDone.Any(k => k.StartsWith(p.AlbumDir + "#", StringComparison.OrdinalIgnoreCase));
            if (p.HasImage && !showAll && !fresh) continue;

            // Three states, not two. An album with a cover sitting in review is
            // neither done nor pending: regenerating it would throw away a picture
            // waiting to be looked at, and listing it as untouched would hide the
            // fact that there is something to approve.
            var (mark, brush) =
                fresh || p.AwaitingReview ? ("◷", WarnAmber)
                : p.HasImage ? ("✓", TickOld)
                : ("", Brushes.Transparent);

            rows.Add(new Row
            {
                Mark = mark,
                MarkBrush = fresh ? TickFresh : brush,
                Title = p.AwaitingReview || fresh ? p.Title + "   — in review" : p.Title,
                Job = p,
            });
        }

        if (rows.Count == 0)
        {
            // Says which filter emptied it. "No albums under this persona" would be
            // a lie when the persona has forty and they are all Romanian.
            var scope = ChkCoversEnglishOnly?.IsChecked != false ? " English" : "";
            rows.Add(new Row
            {
                Title = _covers.Count == 0
                    ? $"No{scope} albums under this persona."
                    : $"Every{scope} album here already has artwork.",
                MarkBrush = RowPlain,
            });
        }

        LstCovers.ItemsSource = rows;
    }

    private Job? SelectedCover() => (LstCovers?.SelectedItem as Row)?.Job;

    private void LstCovers_SelectionChanged(object sender, SelectionChangedEventArgs e) => ShowCoverPreview(SelectedCover());

    /// <summary>
    /// The cover preview. Square, because covers are, and it shows the file on
    /// disk rather than a render of what is about to be asked for.
    /// </summary>
    private void ShowCoverPreview(Job? p)
    {
        if (CoverPreviewImage == null || CoverPreviewEmpty == null || CoverPreviewCaption == null) return;

        CoverPreviewImage.Source = null;

        // A candidate in review wins over the drive: it is the newer picture and
        // the one there is a decision to make about.
        var file = p == null ? ""
                 : p.AwaitingReview && File.Exists(p.OutFile) ? p.OutFile
                 : p.HasImage ? Path.Combine(p.ArtworkDir, p.ImageFile)
                 : "";

        if (file.Length == 0)
        {
            CoverPreviewEmpty.Text = p == null ? "Select an album to preview its cover" : "No artwork yet — this album is queued.";
            CoverPreviewEmpty.Visibility = Visibility.Visible;
            CoverPreviewCaption.Text = p?.Title ?? "";
            return;
        }

        try
        {
            var (img, w, h) = LoadPreview(file);
            CoverPreviewImage.Source = img;
            CoverPreviewEmpty.Visibility = Visibility.Collapsed;
            var where = p!.AwaitingReview ? "IN REVIEW" : "on the music drive";
            CoverPreviewCaption.Text = $"{p.Title}  ·  {where}  ·  {w}×{h}  ·  {new FileInfo(file).Length / 1024:N0} KB";
        }
        catch (Exception ex)
        {
            CoverPreviewEmpty.Text = "Could not read this cover.";
            CoverPreviewEmpty.Visibility = Visibility.Visible;
            CoverPreviewCaption.Text = ex.Message;
        }
    }

    /// <summary>Show a specific file mid-run, when it has just landed.</summary>
    private void ShowCoverPreviewFile(string file, string caption)
    {
        if (CoverPreviewImage == null || !File.Exists(file)) return;
        try
        {
            var (img, w, h) = LoadPreview(file);
            CoverPreviewImage.Source = img;
            CoverPreviewEmpty.Visibility = Visibility.Collapsed;
            CoverPreviewCaption.Text = $"{caption}  ·  JUST GENERATED  ·  {w}×{h}  ·  {new FileInfo(file).Length / 1024:N0} KB";
        }
        catch { /* the run matters more than the preview */ }
    }

    // ========================================================================
    //  THE GENERATION BRIEF, OUT OF .models
    // ========================================================================

    /// <summary>
    /// The "Generation brief" section of a persona's model file, flattened to
    /// prompt text.
    ///
    /// Located by its HEADING TEXT, not its number: the section is §11 in some of
    /// the twelve files and §12 in others, because a persona with an extra
    /// findings section pushes it down one. Matching on the number would silently
    /// pick up the wrong section for half the family.
    ///
    /// The whole section is taken, not only the blockquote — the paragraphs under
    /// it carry the arc choice, the governing instruction and the "do not" list,
    /// which are the parts that stop a cover being generically pretty and wrong.
    /// </summary>
    private string BriefFor(string voice)
    {
        if (_briefs.TryGetValue(voice, out var hit)) return hit;

        var file = Path.Combine(ModelsRoot, $"model_{voice}.md");
        if (!File.Exists(file)) { _briefs[voice] = ""; return ""; }

        string text;
        try { text = File.ReadAllText(file); }
        catch (Exception ex) { Log($"  ⚠ Could not read {Path.GetFileName(file)}: {ex.Message}"); _briefs[voice] = ""; return ""; }

        var sb = new StringBuilder();
        bool inSection = false;
        foreach (var raw in text.Split('\n'))
        {
            var line = raw.TrimEnd('\r');
            if (line.StartsWith("## ", StringComparison.Ordinal))
            {
                if (inSection) break;                                   // next heading ends it
                inSection = line.Contains("Generation brief", StringComparison.OrdinalIgnoreCase);
                continue;
            }
            if (!inSection) continue;
            if (line.StartsWith("---", StringComparison.Ordinal)) break; // horizontal rule ends it

            sb.Append(StripMarkdown(line)).Append(' ');
        }

        var brief = Regex.Replace(sb.ToString(), @"\s+", " ").Trim();
        if (brief.Length > BriefCap) brief = brief[..BriefCap].TrimEnd() + "…";
        _briefs[voice] = brief;
        return brief;
    }

    /// <summary>
    /// Long enough for the whole brief on all twelve, short enough that the album's
    /// own content is not crowded out of the far end of the prompt.
    /// </summary>
    private const int BriefCap = 2200;

    /// <summary>
    /// Markdown to plain text. The model files are heavily marked up — bold,
    /// blockquotes, emoji callouts — and every one of those characters would
    /// arrive in the prompt as literal punctuation for the model to interpret.
    /// </summary>
    private static string StripMarkdown(string s)
    {
        s = Regex.Replace(s, @"^\s*>\s?", "");            // blockquote marker
        s = Regex.Replace(s, @"`([^`]*)`", "$1");         // inline code
        s = Regex.Replace(s, @"\*\*([^*]*)\*\*", "$1");   // bold
        s = Regex.Replace(s, @"(?<!\*)\*([^*]+)\*(?!\*)", "$1"); // italic
        s = Regex.Replace(s, @"\[([^\]]*)\]\([^)]*\)", "$1");    // links
        s = s.Replace("🔴", "").Replace("⚠", "").Replace("**", "");
        return s.Trim();
    }

    // ---- the album's own content --------------------------------------------

    private void LoadAlbumFacts()
    {
        if (_themes.Count > 0 || _genres.Count > 0) return;
        var dir = Path.Combine(WebPublic, "music");
        Read(Path.Combine(dir, "album-themes.json"), "themes", _themes, v => v?.GetValue<string>() ?? "");
        Read(Path.Combine(dir, "album-genres.json"), "genres", _genres,
             v => v is JsonArray a ? string.Join(" / ", a.Select(x => x?.GetValue<string>() ?? "")) : "");

        static void Read(string file, string key, Dictionary<string, string> into, Func<JsonNode?, string> pick)
        {
            try
            {
                if (!File.Exists(file)) return;
                if (JsonNode.Parse(File.ReadAllText(file))?[key] is not JsonObject obj) return;
                foreach (var kv in obj)
                {
                    var v = pick(kv.Value);
                    if (v.Length > 0) into[kv.Key] = v;
                }
            }
            catch { /* a missing theme costs nuance, not the prompt */ }
        }
    }

    /// <summary>
    /// The album's song titles, off its lyrics file.
    ///
    /// Read here rather than during the scan, and this is the only place the
    /// lyrics are touched: it is one file read for one album at the moment its
    /// prompt is built, instead of 850 reads every time the view is opened.
    /// </summary>
    private static List<string> SongTitlesFor(Job job)
    {
        var lyricsDir = Path.Combine(job.AlbumDir, "lyrics");
        if (!Directory.Exists(lyricsDir)) return new();
        var file = Directory.EnumerateFiles(lyricsDir, "*.md")
            .Where(f => !Path.GetFileName(f).Equals("blueprint.md", StringComparison.OrdinalIgnoreCase))
            .OrderByDescending(f => Path.GetFileName(f).Contains("-lyrics", StringComparison.OrdinalIgnoreCase))
            .ThenBy(f => f, StringComparer.OrdinalIgnoreCase)
            .FirstOrDefault();
        if (file == null) return new();

        // The house lyrics format: one "SONG TITLE: <name>" line per track. Same
        // shape the Album Music view in JubileePraise Studio reads.
        try
        {
            return File.ReadAllLines(file)
                .Select(l => Regex.Match(l.TrimEnd('\r'), @"^SONG TITLE:\s*(.+?)\s*$"))
                .Where(m => m.Success)
                .Select(m => Regex.Replace(m.Groups[1].Value, @"^\d+\s+", "").Trim())
                .Where(n => n.Length > 0)
                .Take(12)
                .ToList();
        }
        catch { return new(); }
    }

    // ========================================================================
    //  THE PROMPT
    // ========================================================================

    /// <summary>
    /// One album's prompt: how this persona's covers look, then what THIS album is
    /// about, then the derivation instruction.
    ///
    /// The order is deliberate. The persona's visual system comes first because it
    /// is the part that must not vary; the album's content comes second because it
    /// is the part that must; and the instruction to read the songs comes last,
    /// where the web UI honours it most reliably.
    /// </summary>
    private string BuildCoverPrompt(Job job, string voice)
    {
        LoadAlbumFacts();
        var brief = BriefFor(voice);
        if (brief.Length == 0) return "";

        var title = TitleOf(job);
        var index = AlbumIndexOf(job);
        var sb = new StringBuilder();

        sb.Append("Create a square album cover photograph for a music album, matching the attached existing covers. ");
        sb.Append(brief);

        sb.Append(" THIS ALBUM: the title is \"").Append(title).Append("\".");
        if (_themes.TryGetValue(job.Code, out var theme) && theme.Length > 0)
            sb.Append(" What it is about: ").Append(theme).Append('.');
        if (_genres.TryGetValue(job.Code, out var genre) && genre.Length > 0)
            sb.Append(" Its musical style is ").Append(genre).Append('.');

        var songs = SongTitlesFor(job);
        if (songs.Count > 0)
            sb.Append(" Its songs are: ").Append(string.Join("; ", songs)).Append('.');

        sb.Append(" Read those song titles and stage ONE specific, concrete moment from them — a particular ")
          .Append("real place, with something real in the subject's hands, that belongs to this album and no other.");

        // The draft's angle comes first of the three, because it decides what the
        // picture is ABOUT; shot and light then decide how it is taken. All three
        // are assigned rather than left open — left open, every cover came back as
        // the same full-length frontal flat-lit standing pose.
        sb.Append(" APPROACH FOR THIS DRAFT — ").Append(Approaches[job.Variant % Approaches.Length]);
        sb.Append(" FRAME IT AS ").Append(Shots[(index + job.Variant) % Shots.Length]).Append('.');
        sb.Append(" LIGHT IT WITH ").Append(Lights[(index + job.Variant * 2) % Lights.Length]).Append('.');

        // What this persona has already done, so it is not done again. The register
        // comes out of the model file; the run list is what has been asked for
        // since Generate was pressed.
        var used = new List<string>();
        var register = AlreadyUsed(voice);
        if (register.Count > 0)
        {
            // A rotating window rather than the whole register: one persona's runs
            // to 78 entries and the prompt has an album to describe as well. The
            // window walks with the album index, so across a sweep the whole
            // register gets used.
            const int window = 18;
            for (int i = 0; i < Math.Min(window, register.Count); i++)
                used.Add(register[(index * 3 + i) % register.Count]);
        }
        if (_usedThisRun.TryGetValue(voice, out var run)) used.AddRange(run);

        if (used.Count > 0)
        {
            var list = string.Join("; ", used.Distinct(StringComparer.OrdinalIgnoreCase));
            if (list.Length > 1400) list = list[..1400].TrimEnd() + "…";
            // Worded as "find a different one of EQUAL beauty", not as a bare ban.
            // A bare ban is what produced the corridor and the workshop: told only
            // to avoid what already existed, it walked away from this artist's best
            // territory — crowds, thrones, gardens — and into novelty for its own
            // sake. Uniqueness is not the goal; a DIFFERENT GREAT COVER is.
            sb.Append(" SETTINGS THIS ARTIST HAS ALREADY USED — find a different one of equal or greater ")
              .Append("beauty and celebration rather than repeating or lightly varying any of these: ")
              .Append(list).Append('.');
        }

        sb.Append(CoverAppealClause);
        sb.Append(CoverAuthorClause(FirstNameOf(job)));
        sb.Append(AgeClause(FirstNameOf(job)));
        sb.Append(BuildClause(FirstNameOf(job)));
        sb.Append(ProportionClause(FirstNameOf(job)));
        // AFTER CoverAuthorClause, which tells the image to copy the wardrobe from
        // the attached covers. This is the carve-out from that instruction, and a
        // carve-out has to be read after the rule it narrows.
        sb.Append(NoBridalClause(FirstNameOf(job)));
        // And this narrows NoBridalClause in turn, for the skirt-only personas.
        sb.Append(ModestWardrobeClause(FirstNameOf(job)));
        sb.Append(SelfCheckClause(FirstNameOf(job)));

        // Remember what was asked for, so the next album in this run is told about
        // it too. Recorded once per ALBUM, not once per draft: the four drafts
        // already carry four different assigned angles, and listing the same album
        // four times would crowd the genuinely useful entries out of the window.
        if (job.Variant == 0)
        {
            if (!_usedThisRun.TryGetValue(voice, out var mine)) _usedThisRun[voice] = mine = new List<string>();
            mine.Add($"\"{title}\"");
        }

        return sb.ToString();
    }

    /// <summary>The persona's given name — "Melody Inspire" → "Melody".</summary>
    private static string FirstNameOf(Job job) =>
        job.Artist.Split(' ', StringSplitOptions.RemoveEmptyEntries).FirstOrDefault() ?? "";

    // ========================================================================
    //  LEARNING FROM THE COVERS THAT ALREADY EXIST
    // ========================================================================

    /// <summary>
    /// How many of a persona's own covers ride along as a style reference.
    ///
    /// Three, not one. One exemplar teaches a look and gets copied; three
    /// DIFFERENT ones teach a range, which is the thing that was missing — the
    /// first run produced six covers in the same white hall because the brief
    /// described the median cover and nothing showed the spread around it.
    /// </summary>
    private const int StyleRefCount = 3;

    /// <summary>Every existing cover master for a voice, cached per scan.</summary>
    private readonly Dictionary<string, List<string>> _exemplars = new(StringComparer.OrdinalIgnoreCase);

    private List<string> ExemplarsFor(string voice)
    {
        if (_exemplars.TryGetValue(voice, out var hit)) return hit;
        var found = new List<string>();
        var voiceDir = Path.Combine(EffectiveMusicRoot, voice);
        if (Directory.Exists(voiceDir))
        {
            foreach (var dir in Directory.EnumerateDirectories(voiceDir).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                var art = Path.Combine(dir, "artwork");
                if (!Directory.Exists(art)) continue;
                var code = Path.GetFileName(dir).Split('-', 2)[0];
                var f = ExistingCover(art, code);
                if (f.Length > 0) found.Add(Path.Combine(art, f));
            }
        }
        _exemplars[voice] = found;
        return found;
    }

    /// <summary>
    /// Three of this persona's covers, spread ACROSS the catalogue rather than
    /// taken from the front of it, and rotated per album so consecutive albums do
    /// not learn from the same three pictures.
    ///
    /// Spread matters: the first three covers by code for one persona are all the
    /// same garden balustrade, and three of those would teach exactly the sameness
    /// this is meant to cure.
    /// </summary>
    private List<string> StyleRefsFor(string voice, int albumIndex)
    {
        var all = ExemplarsFor(voice);
        if (all.Count == 0) return new();
        var picks = new List<string>();
        var stride = Math.Max(1, all.Count / StyleRefCount);
        for (int i = 0; i < StyleRefCount && picks.Count < all.Count; i++)
        {
            var at = ((albumIndex * 7) + (i * stride)) % all.Count;   // 7: coprime with most counts, so the window walks
            var f = all[at];
            if (!picks.Contains(f)) picks.Add(f);
        }
        return picks;
    }

    /// <summary>
    /// The style references for one cover job, registered for centre-cropping so
    /// the wordmark and title baked into them do not travel with the reference.
    ///
    /// Offset by the draft number so the four drafts of one album do not all learn
    /// from the same three exemplars — four angles taught by four different sets of
    /// references spread further than four angles alone.
    /// </summary>
    private List<string> CoverReferencesFor(Job job)
    {
        var refs = StyleRefsFor(VoiceOf(job), AlbumIndexOf(job) + job.Variant);
        foreach (var r in refs) _croppedRefs.Add(r);
        return refs;
    }

    // ========================================================================
    //  NOT REPEATING WHAT ALREADY EXISTS
    // ========================================================================

    /// <summary>
    /// Every composition this persona has already used, read out of the per-album
    /// register table in its model file.
    ///
    /// That table has one row per existing cover with a short description of what
    /// the picture shows, which makes it an inventory of exactly what must not be
    /// made again. It is the reason the model files were worth writing.
    /// </summary>
    private readonly Dictionary<string, List<string>> _alreadyUsed = new(StringComparer.OrdinalIgnoreCase);

    private List<string> AlreadyUsed(string voice)
    {
        if (_alreadyUsed.TryGetValue(voice, out var hit)) return hit;
        var list = new List<string>();
        var file = Path.Combine(ModelsRoot, $"model_{voice}.md");
        if (File.Exists(file))
        {
            try
            {
                foreach (var raw in File.ReadAllLines(file))
                {
                    var line = raw.Trim();
                    if (!line.StartsWith('|')) continue;
                    var cells = line.Split('|', StringSplitOptions.None)
                                    .Select(c => StripMarkdown(c.Trim())).ToArray();
                    // | # | Code | Title | The image | Device |  → 7 with the empty
                    // leading and trailing cells the split produces.
                    if (cells.Length < 6) continue;
                    var what = cells[4];
                    if (what.Length < 8 || what.StartsWith("The image", StringComparison.OrdinalIgnoreCase)) continue;
                    if (what.Contains("---", StringComparison.Ordinal)) continue;
                    list.Add(what);
                }
            }
            catch { /* an unreadable register costs variety, not the run */ }
        }
        _alreadyUsed[voice] = list;
        return list;
    }

    /// <summary>What this RUN has already been asked for, per voice.</summary>
    private readonly Dictionary<string, List<string>> _usedThisRun = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// The four angles every album is attacked from, one per draft.
    ///
    /// Four drafts exist because a single interpretation of a title is a coin
    /// toss. "Named Before the Likes" read literally produces an egg — a thing
    /// named before it hatches, which is clever, correct, and a cover nobody would
    /// ever pick up. Four different angles mean the clever-but-dead reading is one
    /// of four rather than the only one.
    /// </summary>
    private static readonly string[] Approaches =
    {
        "THE CELEBRATION. Stage the album's joy as a public, shared event — a feast, a procession, a dance, " +
        "a crowd applauding, a gathering that has just erupted. The subject is SURROUNDED BY PEOPLE who are " +
        "delighted to be with them. Faces, colour, motion, warmth. This is the most marketable of the four " +
        "and it should look like the best day of someone's life.",

        "THE MAJESTY. Stage it as ceremony and honour — a throne room, a palace garden, a coronation, a " +
        "great hall dressed for an occasion, banners, marble, gold, flowers. The subject is being HONOURED " +
        "or is presiding, attended by people who love them. Grand, opulent, radiant; never austere and never empty.",

        "THE WONDER. Put them in an EXOTIC OR HEAVENLY PLACE that embodies what this album is about — a " +
        "hanging garden, a shore at sunrise, a mountain of cloud, a city of gold, a field in full bloom, a " +
        "cathedral of light, a waterfall, an orchard in blossom. Somewhere a person would stop and stare. " +
        "The location is spectacular and they belong in it.",

        "THE INTIMACY. Come in close on ONE beautiful human moment from the record — the face, the hands, " +
        "one meaningful object, gorgeous light. Warm, tender, immediate, and still gorgeous: this is the " +
        "quiet one of the four, not the drab one.",
    };

    /// <summary>
    /// Framing options. Every one keeps the face visible and the subject large.
    ///
    /// A previous set included "from behind or in profile" and an environmental
    /// option where the place mattered more than the person. Both are legitimate
    /// photography and neither belongs on a record sleeve — together they produced
    /// a figure facing away in an empty banquet room.
    /// </summary>
    private static readonly string[] Shots =
    {
        "a TIGHT PORTRAIT — the face large in the frame, lit beautifully, an expression worth looking at",
        "a WAIST-UP shot, hands doing the thing, the subject filling roughly two thirds of the frame height",
        "a THREE-QUARTER shot with real movement in it — mid-turn, mid-step, mid-laugh — not a static pose",
        "a shot from INSIDE A GROUP, the subject central and clearly lit, other faces around them",
    };

    /// <summary>
    /// Lighting options, and every one of them is beautiful.
    ///
    /// This is where an early run actually went wrong. Three of the five previous
    /// options were "night, most of the frame dark", "soft overcast, low contrast,
    /// no flare" and "hard side-raking shadow" — cinematography-school choices that
    /// fight this catalogue's whole look, and they are exactly what produced a dim
    /// hospital corridor and an unlit workshop. Variety has to happen INSIDE
    /// beautiful, not between beautiful and drab.
    /// </summary>
    private static readonly string[] Lights =
    {
        "blazing golden-hour backlight with visible lens flare and a hot rim on the hair",
        "high-key radiant daylight, blown-out and luminous, with prismatic sparkle in the air",
        "a warm festival glow — lanterns, string lights, candles, firelight — rich and celebratory",
        "a sunburst breaking through with visible god-rays and drifting golden motes",
        "soft rose-gold dawn light, glowing and optimistic",
    };

    /// <summary>
    /// The commercial bar, appended to every cover prompt.
    ///
    /// This is the clause the first two runs were missing entirely. Everything else
    /// told the model what to put in the frame; nothing told it the frame had to be
    /// one somebody would want to own. So it optimised for accuracy — an egg for
    /// "Named Before the Likes", an empty banquet room for "Never a Solo" — and
    /// both are defensible readings of the title and neither is a record sleeve.
    ///
    /// The banned list is specific on purpose. Every item on it is something an
    /// earlier run actually produced.
    ///
    /// ONE LINE. A newline anywhere in a prompt truncates it — see AttemptOne.
    /// </summary>
    private const string CoverAppealClause =
        " THE COMMERCIAL BAR — this is a COMMERCIAL ALBUM COVER for release, not an illustration of the " +
        "title. It has to make a stranger scrolling past want to stop and play the record, and it has to do " +
        "that at thumbnail size. Judge your own image before you finish it: if it would not score at least " +
        "95 out of 100 as marketing artwork for a major release, change it. " +
        "It must be JOYFUL, CELEBRATORY, WARM, ASPIRATIONAL and ALIVE. Rich colour. Beautiful light. " +
        "Something happening. Wherever the album allows it, OTHER PEOPLE should be in the frame, enjoying " +
        "themselves and enjoying the artist. " +
        "FORBIDDEN, without exception: empty rooms, bare corridors, hospital or clinical spaces, dim " +
        "workshops, basements, plain walls, grey or drab palettes, gloom, clutter, sterile modern interiors, " +
        "and any frame where the subject is alone in a space that looks sad, austere, institutional or " +
        "abandoned. A literal-but-lifeless illustration of the title is a FAILURE even when it is accurate. " +
        "If the concept you have chosen cannot be staged somewhere beautiful and full of life, choose a " +
        "different concept.";

    // ---- how old the family looks, and what build it has ---------------------

    /// <summary>
    /// The family's canonical apparent age. Thirty for all twelve, except Elias,
    /// who is forty with white hair and a white beard.
    ///
    /// Stated HERE rather than only in the .models briefs, and for a specific
    /// reason: the briefs are prose a person edits, and twelve copies of a fact are
    /// twelve chances for one of them to drift. This is the one the prompt actually
    /// carries, so a brief that still says "mid-30s" cannot quietly outvote it.
    /// </summary>
    private static string ApparentAgeOf(string firstName) =>
        string.Equals(firstName, "Elias", StringComparison.OrdinalIgnoreCase)
            ? "FORTY years old, with WHITE hair and a full WHITE beard — white-haired at forty, " +
              "not an old man: the face is unlined and firm and reads as forty, never as sixty"
            : "THIRTY years old — a young adult, with smooth unlined skin";

    /// <summary>
    /// The age instruction, and it has to OVERRIDE the attached references.
    ///
    /// That override is the whole point. A cover learns its likeness from this
    /// persona's released covers, and those covers were rendered under the old
    /// ages — Elias at sixty, Nova at late twenties. Without an explicit
    /// "regardless of the reference", the images would keep reproducing the age
    /// they were shown rather than the age that is now canon.
    ///
    /// ONE LINE.
    /// </summary>
    private static string AgeClause(string firstName) =>
        " AGE — render " + firstName + " as " + ApparentAgeOf(firstName) + ". " +
        "This OVERRIDES the attached reference images: take the facial identity, features and colouring " +
        "from them, but if a reference shows an older or a younger person, the age in THIS image is the " +
        "one stated here. No ageing beyond it — no deep lines, no jowls, no stoop, no frailty.";

    /// <summary>
    /// The family's build. Slender, lean and fit, for every one of the twelve.
    ///
    /// Stated HERE for the same reason the age is: the .models briefs describe
    /// wardrobe, colour and light and say NOTHING about the body, so until this
    /// existed the generator was free to invent one — and did.
    ///
    /// 🔴 POSITIVE ONLY, AND THAT IS A MEASURED RESULT, NOT A STYLE PREFERENCE.
    /// InspireManna's runner/persona-image.js hit this first and wrote down what
    /// happened: a line ending "never heavy set, stocky or overweight" produced
    /// heavy renders anyway, because an image model does not subtract a concept it
    /// has been shown — naming the wrong reading in order to forbid it PLANTS it.
    /// "Slender" on its own read as a soft preference and was overridden by the
    /// reference. So the build is described concretely, at length, and every word
    /// of it is a word we want in the picture. Do not add a "never …" to this
    /// clause. That has been tried and it makes the problem worse.
    ///
    /// HEALTHY, not thin. "Fit" and "healthy" are load-bearing words — the target
    /// is an athletic thirty-year-old in good condition, not a gaunt one.
    ///
    /// ONE LINE.
    /// </summary>
    private static string BuildClause(string firstName) =>
        " BUILD — " + firstName + " is SLENDER AND LEAN, and so is every member of the Inspire Family who " +
        "appears in this image: light framed, trim and long limbed, with narrow shoulders, a slim waist and " +
        "a clean defined jawline — the fit, healthy, athletic figure of " +
        (string.Equals(firstName, "Elias", StringComparison.OrdinalIgnoreCase)
            ? "an active adult in strong condition, still lean and upright at forty"
            : "an active young adult in the prime of life") + ". " +
        "Carry it through the whole figure: the face is slim and clearly boned, the neck and shoulders are " +
        "fine, the posture is tall, open and easy, and the wardrobe hangs cleanly on a lean frame. " +
        "This OVERRIDES the attached reference images: take the facial identity, features and colouring " +
        "from them, and render the build stated here.";

    /// <summary>
    /// No bridal wear, no wedding, no groom — for every persona, on every image.
    ///
    /// 🔴 WHY THIS IS A PROBLEM AT ALL, AND WHY JUBILEE MOST OF ALL. The signature
    /// wardrobe of several of the family is a long white or iridescent gown, and
    /// Jubilee's is white by definition. A white floor-length gown photographed in
    /// a garden, a hall or a procession is one veil away from a wedding photograph,
    /// and the generator does not know that is a line — it will add the veil, the
    /// bouquet and the arch on its own because that is what the training data says
    /// goes with the dress. The result reads as a marriage ceremony involving a
    /// persona, which is exactly what must never ship.
    ///
    /// 🔴 POSITIVE FIRST, THEN DISCRETE NOUNS — and the order is the whole design.
    /// BuildClause above records the measured lesson that naming a wrong reading in
    /// order to forbid it PLANTS it. That lesson is about ATTRIBUTES: "not heavy"
    /// cannot be subtracted from a body, because there is no body without a build.
    /// It does NOT hold the same way for discrete removable OBJECTS — a veil, a
    /// bouquet, an altar are things that are either in frame or not, and the same
    /// file already forbids "empty rooms" and "text of any kind" successfully.
    ///
    /// So this clause does both, in this order: it first says positively what the
    /// wardrobe IS — ordinary contemporary clothing in the signature colours — so
    /// the model has something to render rather than an absence to honour; and only
    /// then lists the specific objects and events that must not appear. The phrase
    /// "wedding dress" is deliberately never used to describe the gown, because
    /// that would plant the very reading it is trying to prevent.
    ///
    /// ONE LINE.
    /// </summary>
    private static string NoBridalClause(string firstName) =>
        " WARDROBE AND OCCASION — dress " + firstName + " in ORDINARY CONTEMPORARY CLOTHING suited to what " +
        "is happening in the picture: everyday day-wear, stage or concert wear, or festival and party " +
        "clothes. Keep the signature colours and cut exactly as the references show them — where that " +
        "signature is white or iridescent it STAYS white or iridescent, styled as a normal modern dress or " +
        "outfit that someone would wear to a concert, a celebration or a day out. " +
        "THE SCENE IS AN ORDINARY OCCASION, never a marriage ceremony. None of the following may appear " +
        "anywhere in the image: a veil, a long trailing train, a carried bouquet, a tiara or jewelled " +
        "headpiece, a buttonhole flower, rings being exchanged or displayed, an altar, an aisle, a flower " +
        "arch, a tiered cake, a matched party of attendants, a formal tailcoat or tuxedo, or a couple posed " +
        "as though being married. " +
        "This OVERRIDES the attached reference images: if a reference happens to read as bridal or as a " +
        "wedding, render the SAME person in the SAME signature colours wearing ordinary clothing at an " +
        "ordinary occasion instead.";

    // ---- modest wardrobe: skirts below the knee ------------------------------

    /// <summary>
    /// The personas who are always dressed in a skirt or dress whose hem falls
    /// below the knee — never trousers, jeans, shorts or a short skirt.
    ///
    /// 🔴 JUBILEE, AND WHY (Founder direction, 2026-09-11). Complaints came in
    /// about heroes showing Jubilee in trousers and cropped or short pants, and
    /// about others where her white gown read as a bridal gown. The direction is
    /// conservative imagery: a LONG skirt, hem below the knee, and nothing that
    /// reads as a wedding. Eighteen heroes were pulled for it — see
    /// review\_heroes-rejected\jubilee-inspire.
    ///
    /// One list, by given name, so widening it to another persona is one word.
    /// It is deliberately NOT every woman in the family by default — that is a
    /// wardrobe decision per persona, and it was only taken for Jubilee.
    /// </summary>
    private static readonly HashSet<string> SkirtOnlyPersonas = new(StringComparer.OrdinalIgnoreCase)
    {
        "Jubilee",
    };

    private static bool IsSkirtOnly(string firstName) => SkirtOnlyPersonas.Contains(firstName);

    /// <summary>
    /// The modest-wardrobe instruction for a skirt-only persona; "" for anyone else.
    ///
    /// 🔴 IT IS PHRASED AS A CHANGE, NOT A PREFERENCE. The hero view hands the model
    /// a cover and says "keep the wardrobe identical", and a cover that shows
    /// trousers will be copied faithfully unless the prompt says, in so many words,
    /// that the trousers are to be REPLACED. Naming the garments here does not
    /// plant them the way naming a body type does (see BuildClause): they are
    /// discrete objects, and the reference is already showing them.
    ///
    /// 🔴 TWO PIECES, AND A SECOND COLOUR, ARE THE ANTI-BRIDAL DEVICE. A long white
    /// skirt under a matching white bodice IS the floor-length gown that read as
    /// bridal — lengthening the hem makes that problem worse, not better. A skirt
    /// and a separate top in a clear second colour cannot be read as one gown.
    /// The skirt keeps her white; the top carries the colour, echoing the turquoise
    /// stone at her throat.
    ///
    /// 🔴 NEVER "This OVERRIDES the attached reference images …" in this clause.
    /// SanitizeForFilter's pass 5 strips every sentence that starts that way, and
    /// this is the clause that must survive every rewrite.
    ///
    /// Read AFTER NoBridalClause, which it narrows: that clause keeps the signature
    /// cut, and this one changes it.
    ///
    /// ONE LINE.
    /// </summary>
    private static string ModestWardrobeClause(string firstName) => !IsSkirtOnly(firstName) ? "" :
        " MODEST WARDROBE FOR " + firstName.ToUpperInvariant() + " — this is more specific than every other " +
        "wardrobe instruction in this request and governs wherever they differ, including the instruction to " +
        "keep the wardrobe the same as the attached image. " +
        firstName + " wears a LONG SKIRT whose hem falls WELL BELOW THE KNEE — mid-calf to ankle length — " +
        "flowing and softly draped, worn as TWO SEPARATE PIECES: the skirt in white, cream or pearl, and above " +
        "it a separate long-sleeved blouse, fitted top or light tailored jacket with a modest high neckline and " +
        "the turquoise stone at the throat, in a clear SECOND COLOUR — turquoise, soft gold, sky blue or " +
        "silver-grey — so the outfit reads at a glance as two pieces of contemporary day or stage wear. " +
        "Her legs are covered to below the knee in every pose — standing, seated, walking, kneeling or dancing. " +
        "CHANGE THE CLOTHING IF THE ATTACHED IMAGE DIFFERS: if it shows her in trousers, jeans, shorts, " +
        "cropped pants, leggings, a jumpsuit, a short skirt, a skirt at or above the knee or a skirt with a " +
        "high slit, replace that garment with the long skirt described here; if it shows her in a single " +
        "full-skirted floor-length white gown, replace it with the two-piece skirt and top described here. " +
        "Her face, hair, the setting, the light and everything else stay exactly as they were.";

    /// <summary>
    /// True adult proportions, for every persona, on covers and heroes both.
    ///
    /// 🔴 WHY (2026-09-11). Several Jubilee heroes came back with the figure
    /// visibly wrong — the head too large for the body, the legs too short, the
    /// whole person reading as undersized in the scene. The hero prompt is the
    /// likeliest cause: it asks for a WIDER frame with the subject SMALLER in it and
    /// the full height kept in shot, and a model that shrinks a figure to satisfy
    /// all three tends to keep the head at the size the cover had it.
    ///
    /// POSITIVE ONLY, for the reason BuildClause records: naming the wrong body
    /// plants it. So this describes the right one concretely — head count, leg
    /// length, arm reach, scale against the setting — and says the extra width is
    /// scenery. "Never rescaled on one axis" names an operation on the image, not a
    /// body, and is the one negative worth keeping.
    ///
    /// ONE LINE.
    /// </summary>
    private static string ProportionClause(string firstName) =>
        " PROPORTIONS — draw " + firstName + " and every other person in the frame with TRUE ADULT HUMAN " +
        "PROPORTIONS, exactly as an undistorted photograph records them: a full adult height of about seven " +
        "and a half heads, long legs making up about half of that height, the head in natural scale to the " +
        "shoulders, arms that reach to mid-thigh, and hands and feet in scale. Where the whole figure is in " +
        "shot it stands at full adult size relative to the doorways, furniture, animals and people around it. " +
        "Reframing or widening the picture adds SCENERY; the person keeps the proportions a real camera would " +
        "record and is never rescaled on one axis to fit the frame.";

    /// <summary>
    /// A self-check, placed after every instruction it checks and before the
    /// suffix. The covers view already asks the model to judge its own image
    /// against the commercial bar; this asks the same of the three things the
    /// complaints were about, and asks for a correction rather than a report.
    ///
    /// The excluded ceremony items are pointed at by the heading of the clause that
    /// lists them, not named again — see NoBridalClause for why.
    ///
    /// ONE LINE.
    /// </summary>
    private static string SelfCheckClause(string firstName)
    {
        var n = 1;
        var sb = new StringBuilder(" BEFORE YOU RETURN THE IMAGE, CHECK IT AGAINST THESE AND FIX ANY THAT FAIL: ");
        if (IsSkirtOnly(firstName))
        {
            sb.Append('(').Append(n++).Append(") ").Append(firstName)
              .Append(" wears a long skirt whose hem is below the knee, with a separate top in a second colour, ")
              .Append("and her legs are covered to below the knee; ");
        }
        sb.Append('(').Append(n++).Append(") nothing listed under WARDROBE AND OCCASION appears anywhere in the frame; ");
        sb.Append('(').Append(n++).Append(") every person has true adult proportions and is full size in the scene. ");
        sb.Append("If any check fails, correct the image before returning it — do not return one that fails.");
        return sb.ToString();
    }

    /// <summary>
    /// The one-sentence reminder the suffix carries — the last clause of the turn,
    /// which is the one the web UI honours most reliably. Positive only.
    /// </summary>
    private static string SuffixWardrobeReminder(string firstName) =>
        (IsSkirtOnly(firstName)
            ? firstName + " wears a long skirt with its hem well below the knee and a separate top in a second colour. "
            : "") +
        "Every person has true adult proportions. ";

    /// <summary>
    /// What to do with the attached covers.
    ///
    /// The persona IS the subject here, the wardrobe is prescribed rather than
    /// inferred from the setting, and the framing is the house rule the whole
    /// catalogue follows: right of centre, left third clear for the wordmark the
    /// app draws later.
    ///
    /// ONE LINE.
    /// </summary>
    private static string CoverAuthorClause(string firstName) =>
        " The attached images are EXISTING RELEASED COVERS from this same artist, " + firstName + ". " +
        "They are the standard to match and the person to match. " +
        "COPY EXACTLY from them: the face and likeness, the hair, the wardrobe and its cut, the coloured " +
        "stone or marker worn at the throat, the colour palette, the quality of the light, the depth of " +
        "field, and the overall photographic craft and finish. The person must be unmistakably the same " +
        "individual and must be dressed in the same signature wardrobe. " +
        "The one thing NOT taken from them is the apparent age — see the age instruction below, which governs. " +
        "DO NOT COPY from them: the setting, the pose, the props, the camera angle or the composition. " +
        "Those must be NEW. This cover has to sit beside the attached ones as an obvious sibling and still " +
        "be a picture none of them is. " +
        "Ignore any lettering, title text, signature or border visible in the attached images — those are " +
        "added afterwards and must not appear in what you produce. " +
        firstName + " is the subject: place them off-centre toward the RIGHT of the frame, large and clearly " +
        "readable, and keep the left third visually calm. " +
        "Do not render a small distant figure standing in the middle of a large empty room.";

    /// <summary>
    /// The square-format suffix, appended last to every cover prompt.
    ///
    /// LAST, because the last instruction is the one the web UI honours most
    /// reliably and a wrong ratio wastes the whole turn. ONE LINE, because a
    /// newline truncates the prompt.
    ///
    /// The no-lettering demand is load-bearing and not a preference: the app draws
    /// the border, the wordmark and the title itself, in ApplyChrome, from the
    /// album's own meta file. A title a model INVENTED is exactly the failure the
    /// catalogue is already carrying.
    /// </summary>
    private const string CoverSuffix =
        " IMPORTANT: produce this image in a 1:1 square aspect ratio, equal width and height, " +
        "not widescreen and not portrait. " +
        "Leave the left third of the frame visually calm and uncluttered, and keep the bottom edge " +
        "free of important detail. " +
        "CRITICAL: the image must contain NO text of any kind — no title, no lettering, no words, " +
        "no signature, no watermark, no logo, no caption and no border. It is a photograph only. " +
        // Positive phrasing, in the most strongly honoured position in the turn.
        // See NoBridalClause for why the reading being avoided is never named here.
        // SuffixFor adds the per-persona wardrobe reminder after this, and then
        // GenerateNowClause.
        "The clothing is ordinary contemporary wear and the occasion is an ordinary one. ";

    /// <summary>
    /// The close of every cover and hero turn. Split out of the two suffixes so the
    /// per-persona wardrobe reminder can sit just before it, in the last clause of
    /// the turn, rather than after "return the finished picture".
    /// </summary>
    private const string GenerateNowClause =
        "GENERATE THE IMAGE NOW. Do not reply with text, do not ask what to do with the " +
        "attachment, do not offer options or ask which one is wanted, and do not describe what you " +
        "could make. The attachment is a reference, not a question. Return the finished picture.";

    // ========================================================================
    //  THE RUN
    // ========================================================================

    /// <summary>
    /// Albums with no artwork AND nothing already waiting in review. Generating
    /// over a candidate that has not been looked at yet would discard a picture for
    /// no reason — delete it from review to ask for another.
    /// </summary>
    private List<Job> PendingCovers() =>
        _covers.Where(c => !c.HasImage && !c.AwaitingReview && !_completedPaths.Contains(c.Path)).ToList();

    private async void BtnCoversGenerate_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;

        if (!Directory.Exists(ModelsRoot))
        {
            Log($"✗ .models not found at {ModelsRoot}.");
            Log("  Every cover prompt is built from the persona model files there. Nothing was sent.");
            return;
        }

        var pending = PendingCovers();
        if (pending.Count == 0) { Log("Every album in this view already has artwork or a draft in review."); return; }

        // The brief is resolved for every voice in the queue BEFORE the browser is
        // touched. A missing model file is a data problem, and finding it out here
        // costs nothing — whereas finding it out per album, after a conversation has
        // been opened and the page has settled, costs the better part of a minute
        // each, and there could be eighty behind one absent file.
        var ready = new List<Job>();
        var moaned = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var job in pending)
        {
            var voice = VoiceOf(job);
            if (BriefFor(voice).Length == 0)
            {
                if (moaned.Add(voice + "/brief"))
                    Log($"  ✗ No generation brief for {VoiceDisplay(voice)} — .models/model_{voice}.md is missing or has no \"Generation brief\" section.");
                continue;
            }
            // Every cover learns from this persona's own released covers, so a voice
            // with none cannot produce one that belongs. Checked up front for the
            // same reason the brief is.
            if (ExemplarsFor(voice).Count == 0)
            {
                if (moaned.Add(voice + "/refs"))
                    Log($"  ✗ {VoiceDisplay(voice)} has no released cover to learn from — nothing to match against.");
                continue;
            }
            ready.Add(job);
        }

        var blocked = pending.Count - ready.Count;
        if (ready.Count == 0)
        {
            Log("Nothing can be generated: no persona in this queue has a usable generation brief.");
            return;
        }

        // One album becomes N jobs, one per draft angle. Done here rather than in
        // the scan so the worklist stays one row per album — the drafts are an
        // output detail, not something to browse a four-times-longer list for.
        var drafts = SelectedDraftCount();
        var queue = new List<Job>();
        foreach (var a in ready)
            for (int d = 0; d < drafts; d++)
                queue.Add(DraftOf(a, d));

        Log($"\n=== Album Covers: {ready.Count} album(s) × {drafts} draft(s) = {queue.Count} image(s) ==="
            + (blocked > 0 ? $"  ({blocked} skipped for a missing brief)" : ""));
        if (drafts > 1)
            Log("  Four angles per album: celebration · majesty · wonder · intimacy. Keep the one that works.");
        Log(ChkCoverChrome?.IsChecked == true
            ? "  Chrome is ON: the border, the wordmark and the album title are drawn here, from album.meta.json."
            : "  Chrome is OFF: the photograph is saved bare, with no border, wordmark or title.");
        Log($"  Each cover learns from {StyleRefCount} of its persona's own released covers, attached to the turn.");
        Log($"  Output: {ReviewRoot}\\<Persona>\\<Album Title> (CODE) - N.png — for approval, not the music drive.");

        await RunBatch(queue, Kind.Cover);
    }

    private int SelectedDraftCount() =>
        int.TryParse((CmbDrafts?.SelectedItem as ComboBoxItem)?.Tag as string, out var n) ? Math.Max(1, n) : 4;

    /// <summary>
    /// One album's Nth draft. A separate job with its own completion key, its own
    /// angle and its own file, so a partial run leaves the drafts it finished and
    /// re-queues only the ones it did not.
    /// </summary>
    private Job DraftOf(Job album, int variant) => new()
    {
        Path = $"{album.AlbumDir}#{variant}",      // distinct completion key per draft
        Kind = Kind.Cover,
        AlbumDir = album.AlbumDir,
        ArtworkDir = album.ArtworkDir,
        OutFile = ReviewPathFor(VoiceOf(album), album.Code, TitleOf(album), variant + 1),
        Code = album.Code,
        Title = $"{album.Title}   [draft {variant + 1}]",
        Artist = album.Artist,
        Variant = variant,
        Prompt = "",
    };

    /// <summary>The album title alone, with the code prefix and draft suffix removed.</summary>
    private static string TitleOf(Job p)
    {
        var t = p.Title.Contains(" · ") ? p.Title.Split(" · ", 2)[1] : p.Title;
        var cut = t.IndexOf("   [draft", StringComparison.Ordinal);
        return cut >= 0 ? t[..cut].Trim() : t;
    }

    /// <summary>
    /// Where this job's ALBUM sits in the worklist, matched on the album folder.
    ///
    /// A draft job is a copy and is not in _covers, so IndexOf would return -1 for
    /// every one of them — every album would get exemplar window 0 and rotation
    /// slot 0, which is the sameness this whole rotation exists to remove.
    /// </summary>
    private int AlbumIndexOf(Job job)
    {
        for (int i = 0; i < _covers.Count; i++)
            if (string.Equals(_covers[i].AlbumDir, job.AlbumDir, StringComparison.OrdinalIgnoreCase)) return i;
        return 0;
    }

    /// <summary>The voice folder an album job came from — its parent directory.</summary>
    private static string VoiceOf(Job job) =>
        Path.GetFileName(Path.GetDirectoryName(job.AlbumDir) ?? "") ?? "";

    /// <summary>
    /// Fill in the prompt just before the job is sent. RunBatch takes jobs that
    /// already carry one, so this runs at the top of GenerateOne for covers.
    /// </summary>
    private bool PrepareCover(Job job)
    {
        if (job.Prompt.Length > 0) return true;
        job.Prompt = BuildCoverPrompt(job, VoiceOf(job));
        if (job.Prompt.Length == 0) return false;

        // The angle is worth seeing in the log. When a draft comes back wrong the
        // first question is always "what was it actually asked for", and answering
        // it from the log beats re-deriving it from the rotation arithmetic.
        var angle = Approaches[job.Variant % Approaches.Length].Split('.')[0];
        Log($"  Draft {job.Variant + 1} of {Approaches.Length} — {angle}.");
        Log($"  Prompt: {(job.Prompt.Length > 260 ? job.Prompt[..260] + "…" : job.Prompt)}");
        return true;
    }

    // ========================================================================
    //  THE HOUSE CHROME
    // ========================================================================

    /// <summary>
    /// Draw the catalogue's chrome onto a finished photograph: the inset border,
    /// the persona's name in script up the left edge, and the album title along the
    /// bottom.
    ///
    /// DRAWN HERE, NOT GENERATED. The title comes from the album's own
    /// album.meta.json every single time, which is what makes a rename cheap: fix
    /// the meta, regenerate the chrome, done. The catalogue's existing covers were
    /// lettered by the model instead, and one of them — AMIM1001EN — still carries
    /// "BRIDGE ACROSS FAITHS" over an album whose folder, meta and manifest were
    /// all renamed to "Frankincense and Glory" months ago. Nothing found it,
    /// because the words are pixels.
    ///
    /// WPF does the drawing rather than ImageSharp: text, rotation and outlined
    /// glyphs need SixLabors.ImageSharp.Drawing, which is a separate package on a
    /// beta version line, and WPF is already referenced and already renders text.
    ///
    /// Runs on the UI thread — SaveImage is awaited from a UI event handler with no
    /// ConfigureAwait anywhere in the chain, so FormattedText and RenderTargetBitmap
    /// are safe here. It falls back to the untouched photograph on any failure: a
    /// cover with no border is worth vastly more than a lost generation.
    /// </summary>
    private byte[] ApplyChrome(byte[] original, Job job, out string note)
    {
        note = "";
        try
        {
            // Square first. The prompt asks for 1:1 and usually gets it, but a
            // 1024x1536 return would otherwise be chromed at the wrong proportions
            // and land in the catalogue as the one cover that is not square.
            byte[] squared;
            using (var img = SixLabors.ImageSharp.Image.Load(original))
            {
                if (img.Width != img.Height)
                {
                    var side = Math.Min(img.Width, img.Height);
                    img.Mutate(x => x.Crop(new SixLabors.ImageSharp.Rectangle(
                        (img.Width - side) / 2, (img.Height - side) / 2, side, side)));
                    note = $"Returned a non-square image — centre-cropped to {side}×{side}.";
                }
                using var ms = new MemoryStream();
                // Instance Save, not the SaveAsPng extension: that extension lives
                // in the SixLabors.ImageSharp namespace, and bringing that into
                // scope here would make Image, Color, Size, Rectangle and PointF
                // all ambiguous against System.Windows. Same reason every ImageSharp
                // type in this project stays fully qualified.
                img.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
                squared = ms.ToArray();
            }

            if (ChkCoverChrome?.IsChecked != true) return squared;

            var photo = BitmapFrame.Create(new MemoryStream(squared),
                BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            double s = photo.PixelWidth;

            // Re-read the title from disk rather than using the one captured at
            // scan time. It costs one file read and it means fixing a wrong title
            // in album.meta.json and regenerating actually produces the fixed
            // title — which is the entire reason the chrome is drawn here.
            var albumTitle = AlbumTitleOf(job.AlbumDir, Path.GetFileName(job.AlbumDir)).ToUpperInvariant();
            var wordmark = job.Artist;                    // "Melody Inspire"

            var visual = new DrawingVisual();
            using (var dc = visual.RenderOpen())
            {
                dc.DrawImage(photo, new Rect(0, 0, s, s));

                // Every number below was measured against the catalogue's own
                // covers rather than guessed: the chrome was drawn over existing
                // masters from four different personas and tuned until it landed on
                // top of theirs.
                //
                // The border: a thin white rounded rectangle inset about 5%.
                var inset = s * 0.052;
                var pen = new Pen(new SolidColorBrush(Color.FromArgb(0xC8, 0xFF, 0xFF, 0xFF)), Math.Max(1.0, s * 0.0028));
                pen.Freeze();
                dc.DrawRoundedRectangle(null, pen, new Rect(inset, inset, s - inset * 2, s - inset * 2), s * 0.008, s * 0.008);

                // The wordmark: script, rotated 90° counter-clockwise, running UP
                // the left edge, outlined so it survives both a white sky and a dark
                // interior — which it has to, because one persona's covers are
                // white-on-white and another's are black leather at night.
                var script = new Typeface(new FontFamily("Segoe Script, Ink Free, Lucida Handwriting, Segoe UI"),
                    FontStyles.Normal, FontWeights.Normal, FontStretches.Normal);
                // Sized to a fixed FRACTION OF THE COVER, not to a fixed point size.
                // "Zev Inspire" and "Santiago Inspire" differ by five characters, and
                // one constant would run one of them a third of the way up the edge
                // and the other clean off the top. Measuring a probe and scaling also
                // absorbs a font substitution: if Segoe Script is ever missing, the
                // fallback still lands the same length.
                var probe = Text(wordmark, script, s * 0.05);
                var markSize = probe.Width > 0 ? s * 0.05 * (s * WordmarkRun / probe.Width) : s * 0.046;
                var mark = Text(wordmark, script, markSize);
                var markGeo = mark.BuildGeometry(new Point(0, 0));
                var group = new TransformGroup();
                group.Children.Add(new RotateTransform(-90));
                group.Children.Add(new TranslateTransform(inset + s * 0.020, s - inset - s * 0.050));
                markGeo.Transform = group;
                dc.DrawGeometry(Brushes.White,
                    new Pen(new SolidColorBrush(Color.FromArgb(0xB4, 0x10, 0x12, 0x18)), Math.Max(1.0, s * 0.0035)),
                    markGeo);

                // The title: bold condensed caps, right-aligned along the bottom.
                // Two lines maximum — a long localised title that would run off the
                // edge wraps rather than clipping.
                var heavy = new Typeface(new FontFamily("Arial Narrow, Franklin Gothic Demi Cond, Impact, Segoe UI"),
                    FontStyles.Normal, FontWeights.Bold, FontStretches.Condensed);
                var t = Text(albumTitle, heavy, s * 0.042);
                t.TextAlignment = TextAlignment.Right;
                t.MaxTextWidth = s - inset * 2 - s * 0.075;
                t.MaxLineCount = 2;
                t.Trimming = TextTrimming.CharacterEllipsis;

                var tx = inset + s * 0.050;
                var ty = s - inset - s * 0.040 - t.Height;
                // A much finer stroke than the wordmark's. This is a legibility
                // hedge for a title over a bright sky, not an outline: some covers
                // are white on white and the plain white title disappears into them
                // without it.
                dc.DrawGeometry(Brushes.White,
                    new Pen(new SolidColorBrush(Color.FromArgb(0x8C, 0x10, 0x12, 0x18)), Math.Max(1.0, s * 0.0018)),
                    t.BuildGeometry(new Point(tx, ty)));
            }

            var rtb = new RenderTargetBitmap(photo.PixelWidth, photo.PixelHeight, 96, 96, PixelFormats.Pbgra32);
            rtb.Render(visual);
            var enc = new PngBitmapEncoder();
            enc.Frames.Add(BitmapFrame.Create(rtb));
            using var outMs = new MemoryStream();
            enc.Save(outMs);

            note = (note.Length > 0 ? note + " " : "") + $"Chrome applied: “{wordmark}” + “{albumTitle}”.";
            return outMs.ToArray();
        }
        catch (Exception ex)
        {
            // Never lose a generated image to a drawing problem. A bare cover can be
            // chromed later; a discarded one costs another render.
            note = "⚠ Could not draw the chrome (" + ex.Message + ") — saved the bare photograph instead.";
            return original;
        }
    }

    /// <summary>
    /// How far up the left edge the wordmark runs, as a fraction of the cover.
    /// Measured off the catalogue: the twelve sit between roughly 55% and 70%, and
    /// 62% lands on top of them.
    /// </summary>
    private const double WordmarkRun = 0.62;

    private static FormattedText Text(string text, Typeface face, double size) =>
        new(text, System.Globalization.CultureInfo.InvariantCulture, FlowDirection.LeftToRight,
            face, size, Brushes.White, 96);
}
