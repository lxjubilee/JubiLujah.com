using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using Microsoft.Web.WebView2.Core;
// For Mutate(). Every ImageSharp TYPE stays fully qualified below, because
// System.Windows brings its own ResizeMode and Size into scope and an unqualified
// one here would be ambiguous rather than wrong-and-obvious.
using SixLabors.ImageSharp.Processing;

namespace JubileeCoverArtStudio;

// ============================================================================
//  JUBILEE COVER ART STUDIO
// ============================================================================
//
// A WPF host around a real WebView2 (Edge/Chromium) browser. You log in to
// ChatGPT by hand in the embedded browser — a genuine browser, so Cloudflare's
// human-check passes normally — and the session cookies persist in the app's own
// data folder. The app then drives YOUR authenticated session with injected
// JavaScript to submit each image prompt, waits for the picture, and writes it
// to disk.
//
// Two jobs, one browser:
//
//   🎨 ALBUM COVERS  — every album on the music drive with no artwork/<CODE>.png.
//                      The prompt is BUILT from the persona's generation brief in
//                      .models plus the album's own title, theme, genre and song
//                      titles. Drafts land in review/<Persona>/ for approval.
//                      See Covers.cs.
//
//   🖼 IMAGE STUDIO  — anything else. A prompt box, an aspect ratio, a draft
//                      count and an output folder. Same runner, same browser,
//                      no album. See Studio.cs.
//
// Ported from wpf/JubileePraiseStudio (this repo) and, before that, from
// InspireManna.com/tools/ArticleImageStudio. The browser-automation half is
// unchanged from both and lives in ChatGpt.cs; the shell and the two views are
// this app's.
//
// WHY A SECOND APPLICATION RATHER THAN A SIXTH VIEW IN THE FIRST ONE.
// JubileePraise Studio is scoped to this repo's whole publishing workflow —
// article images, album lyrics, the deploy. Cover art is the part that gets used
// on its own, by someone who is not deploying anything, and it is the part that
// wants a general-purpose image bench beside it. Splitting it means the covers
// tool can be opened, run and closed without the deploy machinery being in the
// window at all.
//
// NOTE: nothing here is reviewed automatically. Look at every picture before it
// ships, and look hardest at the likeness.
//
// NOTE: this automates the ChatGPT web UI, which may conflict with OpenAI's
// Terms of Use. It runs against your own logged-in session at your direction.
public partial class MainWindow : Window
{
    /// <summary>
    /// What a queued job is for. It decides where the finished picture is written
    /// and which worklist is re-rendered as each one lands — and nothing else:
    /// the pacing, the retries and the failure handling are identical.
    /// </summary>
    private enum Kind
    {
        /// An album cover. Prompt built from .models; saved to review/.
        Cover,
        /// A free generation. Prompt typed by hand; saved to the studio folder.
        Studio,
        /// A 16:9 website hero, reverse-engineered from the album's own cover.
        /// Prompt built from the album; saved straight into app/web/public/images.
        Hero,
    }

    private const string CHATGPT = "https://chatgpt.com/";

    /// <summary>
    /// The album corpus. A separate volume from the repo, which is why it is a
    /// setting rather than derived from the repo root.
    ///
    /// 🔴 J:\jubileepraise.com\ was created empty by the 2026-08-27 rename and the
    /// ~41 GB of music is still under J:\jubilujah.com\music. If this default finds
    /// nothing, that is why — point Music root at the old path in Settings, or
    /// junction the folder. See CLAUDE.md → "Drives and paths".
    /// </summary>
    private const string DefaultMusicRoot = @"J:\jubileepraise.com\music\inspire";

    private string _root = "";              // the repo, resolved by its marker file
    private string _toolDir = "";
    private string _configFile = "";
    private string _userDataFolder = "";
    private string _musicRoot = DefaultMusicRoot;
    private string _studioRoot = "";        // where free generations land
    /// <summary>
    /// Where hero images land. Empty means "derive it from the repo root", which is
    /// app/web/public/images/heroes — inside the website, because a hero is a site
    /// asset and the point of this view is that making one is publishing one.
    /// </summary>
    private string _heroRoot = "";

    /// <summary>app/web/public — where the album theme and genre tables live.</summary>
    private string WebPublic => Path.Combine(_root, "app", "web", "public");

    /// <summary>
    /// The music root the covers worklist actually reads: the tenant's scope when
    /// one narrows it, and the configured root otherwise.
    ///
    /// Deliberately separate from _musicRoot. That field is what the Settings box
    /// shows and what the config file stores; overwriting it on every tenant
    /// switch would save a scoped path as the user's configured root and leave no
    /// way back to the whole catalogue.
    /// </summary>
    private string EffectiveMusicRoot => _tenantMusicRoot.Length > 0 ? _tenantMusicRoot : _musicRoot;

    // ---- window layout, remembered between runs -----------------------------
    private const double MinPanelWidth = 280;
    private const double MinLogHeight = 52;
    private double _panelWidth = 360;
    private double _logHeight = 170;

    // ---- where the window itself was, last time ----------------------------
    /// <summary>
    /// The NORMAL (restored) bounds, never the maximised ones — see SaveWindowState
    /// for why that distinction is the whole problem. NaN means "nothing saved yet",
    /// which is what makes a first run centre itself instead of landing at 0,0.
    /// </summary>
    private double _winLeft = double.NaN, _winTop = double.NaN;
    private double _winWidth = double.NaN, _winHeight = double.NaN;
    private bool _winMaximized;

    /// <summary>A window smaller than this is assumed to be a bad saved value.</summary>
    private const double MinWindowWidth = 900;
    private const double MinWindowHeight = 520;

    // ---- run state ----------------------------------------------------------
    private bool _ready;                    // the browser has initialised
    private bool _running;                  // a batch is in flight
    private bool _homeRetried;
    private CancellationTokenSource? _cts;
    private TaskCompletionSource<string>? _imageMsg;

    /// <summary>Jobs finished in a previous run or earlier in this one.</summary>
    private readonly HashSet<string> _completedPaths = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Jobs finished in THIS session, which is what earns a green tick.</summary>
    private readonly HashSet<string> _sessionDone = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>Base64 reference images, keyed by path, so one is read once.</summary>
    private readonly Dictionary<string, string> _referenceCache = new(StringComparer.OrdinalIgnoreCase);

    // ---- worklist row colours -----------------------------------------------
    private static readonly Brush TickFresh = new SolidColorBrush(Color.FromRgb(0x5A, 0xD1, 0x8A));
    private static readonly Brush TickOld = new SolidColorBrush(Color.FromRgb(0x4d, 0x56, 0x6c));
    private static readonly Brush WarnAmber = new SolidColorBrush(Color.FromRgb(0xE6, 0xAC, 0x00));
    private static readonly Brush RowPlain = new SolidColorBrush(Color.FromRgb(0x6f, 0x76, 0x84));

    static MainWindow()
    {
        // Frozen once. These are set on every row of a list that is rebuilt on
        // every scan, and an unfrozen brush would be re-registered with the
        // dispatcher each time.
        TickFresh.Freeze(); TickOld.Freeze(); WarnAmber.Freeze(); RowPlain.Freeze();
    }

    /// <summary>One row in a worklist. The tick and the title are separate columns
    /// so they can carry different colours — see the JobList style.
    ///
    /// 🔴 THESE MUST BE PROPERTIES, NOT FIELDS, and that is not a style preference.
    /// WPF data binding resolves a Path against PROPERTIES only; it cannot see a
    /// public field and does not complain when it fails to. As plain fields these
    /// four bound to nothing and every worklist rendered as blank rows — while
    /// selection and the preview pane still worked perfectly, because those read
    /// `.Job` directly in C# rather than through a binding. That combination is
    /// what made it look like a colour problem for so long: the data was always
    /// there, the list just had nothing to draw.
    ///
    /// Same trap, same fix, in Studio.cs GalleryItem.</summary>
    private sealed class Row
    {
        public string Mark { get; set; } = "";
        public Brush MarkBrush { get; set; } = RowPlain;
        public string Title { get; set; } = "";
        public Job? Job { get; set; }
        public override string ToString() => Title;
    }

    /// <summary>
    /// One image to generate. Deliberately flat: a cover and a free generation
    /// share the runner, so they share the record it works from, and the fields
    /// only one of them uses are documented as such rather than split into a
    /// hierarchy the runner would have to switch on.
    /// </summary>
    private sealed class Job
    {
        /// <summary>The completion key. Unique per DRAFT, not per album.</summary>
        public string Path = "";
        public Kind Kind;
        public string Title = "";
        public string Prompt = "";
        /// <summary>Full path of the file to write, filename included.</summary>
        public string OutFile = "";
        /// <summary>Which draft of its parent this is, 0-based.</summary>
        public int Variant;

        // ---- covers only ----------------------------------------------------
        /// <summary>The album folder on the music drive.</summary>
        public string AlbumDir = "";
        /// <summary>The album's artwork folder — where an APPROVED master lives.</summary>
        public string ArtworkDir = "";
        /// <summary>The album code, e.g. MDIM1042EN.</summary>
        public string Code = "";
        /// <summary>The persona display name, e.g. "Melody Inspire".</summary>
        public string Artist = "";
        /// <summary>Existing artwork filename on the drive; "" means none.</summary>
        public string ImageFile = "";
        public bool HasImage => ImageFile.Length > 0;
        /// <summary>True when a draft is already sitting in review for this album.</summary>
        public bool AwaitingReview;

        // ---- heroes only ----------------------------------------------------
        /// <summary>Existing hero image for this album, full path; "" means none.</summary>
        public string HeroFile = "";
        public bool HasHero => HeroFile.Length > 0;
        /// <summary>The newest REJECTED hero in review\_heroes-rejected, full path; "" means none.</summary>
        public string RejectedHero = "";
        /// <summary>Pulled from the site and not yet replaced — the regeneration queue.</summary>
        public bool MarkedForRedo => RejectedHero.Length > 0 && !HasHero;

        // ---- studio only ----------------------------------------------------
        /// <summary>Reference images to attach, as absolute paths.</summary>
        public List<string> References = new();
        /// <summary>False to keep the bytes the model returned, under their own extension.</summary>
        public bool Webp = true;
    }

    public MainWindow()
    {
        InitializeComponent();
        ResolvePaths();
        LoadConfig();
        RepoRoot.Text = _root;
        MusicRoot.Text = _musicRoot;
        StudioRoot.Text = _studioRoot;
        HeroRootBox.Text = HeroRoot;
        ApplyLayout();
        // Before the window is shown, which is the only time WindowStartupLocation
        // and the initial bounds can still be changed.
        ApplyWindowPlacement();
        // Before the persona pickers, because it decides what they are allowed to
        // list. Its own rescan is suppressed here — see ApplyTenant.
        FillTenantPicker();
        FillCoverPersonaPicker();
        _coverUiBuilt = true;   // the covers picker may now trigger a scan
        FillHeroPersonaPicker();
        _heroUiBuilt = true;    // and so may the heroes picker
        AboutText.Text =
            $"Jubilee Cover Art Studio · {typeof(MainWindow).Assembly.GetName().Version}\n" +
            $"Profile: {_userDataFolder}\n" +
            $"Config:  {_configFile}";
        Loaded += async (_, _) => await InitAsync();
        Closing += (_, _) => SaveLayout();
    }

    // ========================================================================
    //  THE RAIL
    // ========================================================================
    //
    // Three views share one panel. The rail's RadioButtons are mutually exclusive
    // by GroupName, so this only has to answer "which one is on" rather than
    // track state of its own.
    //
    // Fires DURING InitializeComponent, because RailCovers carries
    // IsChecked="True" in the markup and BAML sets that property while the window
    // is still being built.
    //
    // Which is why identity comes from `sender` and not from RailCovers. The
    // generated field for a named element is assigned by Connect(), and for the
    // element currently being initialised that has not happened yet: reading
    // RailCovers.IsChecked here throws a NullReferenceException inside
    // InitializeComponent, so the app dies before showing a window. The view
    // fields are safe to test because the rail is declared last in the XAML and
    // they are therefore already built, but sender is safe unconditionally.
    private void Rail_Checked(object sender, RoutedEventArgs e)
    {
        if (ViewCovers == null || ViewStudio == null || ViewHero == null || ViewSettings == null || PanelTitle == null) return;

        var which = (sender as FrameworkElement)?.Name ?? "";
        var covers = which == "RailCovers";
        var studio = which == "RailStudio";
        var hero = which == "RailHero";

        ViewCovers.Visibility = covers ? Visibility.Visible : Visibility.Collapsed;
        ViewStudio.Visibility = studio ? Visibility.Visible : Visibility.Collapsed;
        ViewHero.Visibility = hero ? Visibility.Visible : Visibility.Collapsed;
        ViewSettings.Visibility = (!covers && !studio && !hero) ? Visibility.Visible : Visibility.Collapsed;

        PanelTitle.Text = covers ? "Album Covers" : studio ? "Image Studio" : hero ? "Hero Images" : "Settings";

        // Scanned on first arrival, not on launch: the covers scan walks the whole
        // music drive, and a session that only ever uses the Image Studio should
        // not pay for it. Not gated on _ready — these read folders, not the
        // browser, and gating them on one would leave the view empty for anyone
        // who opened it before ChatGPT finished loading.
        if (covers && _coverUiBuilt && _covers.Count == 0) ScanCovers();
        if (studio && _studioGallery.Count == 0) ScanStudio();
        if (hero && _heroUiBuilt && _heroes.Count == 0) ScanHeroes();
    }

    // ========================================================================
    //  TENANTS
    // ========================================================================
    //
    // One Next.js app serves several sites off the Host header — JubileePraise
    // carries the whole catalogue, the children's labels carry one category each.
    // The picker in the header says which of them the COVERS worklist is scoped
    // to. The Image Studio is unscoped: it has no album, so there is nothing for a
    // tenant to narrow.
    //
    // THE LIST IS READ FROM THE REPO, not maintained here. tenants/*.json is the
    // source of truth; a tenant added there appears in this picker without a code
    // change, and cannot disagree with what the site serves. The built-ins below
    // are the fallback for a checkout where those files are missing, never the
    // primary.

    private sealed class TenantOption
    {
        public string Key = "";
        public string Name = "";                     // "goPartyGiggles.com"
        public string Accent = "#E6AC00";
        public string Source = "";                   // the file it was read from
        public List<string> Categories = new();      // empty = the whole catalogue
        public string MusicDrive = "";               // declared, when the file says
        public string StudioMusicRoot = "";
        public override string ToString() => Name;
    }

    private readonly List<TenantOption> _tenants = new();
    private TenantOption? _tenant;

    /// <summary>Tenant scope, resolved to disk. Empty means "the configured root".</summary>
    private string _tenantMusicRoot = "";

    /// <summary>
    /// Folder names under <see cref="EffectiveMusicRoot"/> this tenant may show.
    /// Empty means all of them, which is JubileePraise and should stay that way.
    /// </summary>
    private readonly List<string> _tenantVoices = new();

    /// <summary>The tenant key read out of the config file, before the list exists.</summary>
    private string _wantedTenantKey = "";

    /// <summary>
    /// Set while the picker is being filled. Assigning SelectedItem raises
    /// SelectionChanged, and letting that run during the constructor would walk
    /// the music drive before the window has been shown.
    /// </summary>
    private bool _suppressTenantEvent;

    private bool VoiceAllowed(string? folder) =>
        _tenantVoices.Count == 0 ||
        (folder != null && _tenantVoices.Contains(folder, StringComparer.OrdinalIgnoreCase));

    /// <summary>The fallback list, for a checkout that has no tenants/ folder.</summary>
    private static List<TenantOption> BuiltInTenants() => new()
    {
        new TenantOption { Key = "jubileepraise", Name = "JubileePraise.com", Accent = "#3DA5FF" },
        new TenantOption { Key = "partygiggles", Name = "goPartyGiggles.com", Accent = "#FF3DA5", Categories = { "party-giggles" } },
        new TenantOption { Key = "tinytiggles", Name = "MyTinyTiggles.com", Accent = "#59C7F5", Categories = { "tiny-tiggles" } },
    };

    /// <summary>
    /// The tenant list, from tenants/*.json.
    ///
    /// Only the JSON files are read here, unlike JubileePraise Studio, which also
    /// parses app/web/lib/tenants.ts as a second fallback. That parser exists
    /// there for a checkout predating the tenants/ folder; this app is newer than
    /// the folder, and a hand-rolled TypeScript scanner is not worth carrying in
    /// two places. If tenants/ is missing, the built-ins are used and the log says
    /// so.
    /// </summary>
    private List<TenantOption> ReadTenantsFromRepo()
    {
        var dir = _root.Length > 0 ? Path.Combine(_root, "tenants") : "";
        if (dir.Length == 0 || !Directory.Exists(dir)) return new();

        var found = new List<TenantOption>();
        foreach (var file in Directory.EnumerateFiles(dir, "*.json").OrderBy(f => f, StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                var n = JsonNode.Parse(File.ReadAllText(file));
                var key = n?["key"]?.GetValue<string>() ?? "";
                var site = n?["site"]?.GetValue<string>() ?? "";
                if (key.Length == 0 || site.Length == 0) continue;

                var t = new TenantOption
                {
                    Key = key,
                    Name = site,
                    Source = Path.GetFileName(file),
                    Accent = n?["brand"]?["accent"]?.GetValue<string>() ?? "#E6AC00",
                };

                var cat = n?["catalogue"];
                t.MusicDrive = cat?["musicDrive"]?.GetValue<string>() ?? "";
                t.StudioMusicRoot = cat?["studioMusicRoot"]?.GetValue<string>() ?? "";
                // `categories: null` is the WHOLE catalogue and is not the same as
                // []. Both arrive here as an empty list, which is correct for null
                // and wrong for [] — but a tenant with [] (Torah Sings) reads no
                // albums from this drive at all, so a covers worklist scoped to it
                // would be empty either way.
                if (cat?["categories"] is JsonArray keys)
                    foreach (var k in keys)
                        if (k?.GetValue<string>() is { Length: > 0 } s) t.Categories.Add(s);

                found.Add(t);
            }
            catch (Exception ex) { Log($"Could not read tenants/{Path.GetFileName(file)}: {ex.Message}"); }
        }

        // The default tenant leads the picker.
        return found.OrderByDescending(x => x.Categories.Count == 0).ToList();
    }

    private string TenantSourceLabel()
    {
        var src = _tenants.FirstOrDefault()?.Source ?? "";
        return src.Length > 0
            ? $"tenants/ ({_tenants.Count(x => x.Source.Length > 0)} file(s))"
            : "the built-in fallback list — no tenants/ folder found";
    }

    private void FillTenantPicker()
    {
        _tenants.Clear();
        var fromRepo = ReadTenantsFromRepo();
        _tenants.AddRange(fromRepo.Count > 0 ? fromRepo : BuiltInTenants());

        _suppressTenantEvent = true;
        TenantPicker.ItemsSource = null;
        TenantPicker.ItemsSource = _tenants;

        // Falls back to the first tenant, which is the flagship: an unrecognised
        // key must not silently open the studio scoped to one children's label.
        var pick = _tenants.FirstOrDefault(x => string.Equals(x.Key, _wantedTenantKey, StringComparison.OrdinalIgnoreCase))
                   ?? _tenants[0];
        TenantPicker.SelectedItem = pick;
        _suppressTenantEvent = false;

        ApplyTenant(pick, rescan: false);
    }

    private void TenantPicker_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (_suppressTenantEvent) return;
        if (TenantPicker.SelectedItem is not TenantOption t) return;
        ApplyTenant(t, rescan: true);
    }

    /// <summary>
    /// Point the covers worklist at a tenant.
    /// </summary>
    /// <param name="rescan">
    /// False exactly once, from the constructor: the worklists have not been built
    /// yet at that point, and walking the music drive there would hold the window
    /// closed behind a disk read.
    /// </param>
    private void ApplyTenant(TenantOption t, bool rescan)
    {
        _tenant = t;

        var (root, voices) = ResolveTenantScope(t);
        _tenantMusicRoot = root;
        _tenantVoices.Clear();
        _tenantVoices.AddRange(voices);

        Title = $"Jubilee Cover Art Studio — {t.Name}";
        HeaderScope.Text = t.Categories.Count == 0
            ? "whole catalogue"
            : (_tenantVoices.Count > 0 ? string.Join(", ", _tenantVoices) : "scope not found on this machine");

        if (!rescan) return;

        Log($"\nWebsite → {t.Name}");
        Log(t.Categories.Count == 0
            ? $"  covers scoped to the whole catalogue, under {EffectiveMusicRoot}"
            : (_tenantVoices.Count > 0
                ? $"  covers scoped to {string.Join(", ", _tenantVoices)}, under {EffectiveMusicRoot}"
                : $"  nothing found on this drive for {string.Join(", ", t.Categories)}"));
        Log("  the Image Studio is unscoped — it writes wherever its output folder points.");

        // The picker below carries the old tenant's folders, so it is rebuilt
        // before anything is asked to scan.
        FillCoverPersonaPicker();
        _covers.Clear();
        if (ViewCovers?.Visibility == Visibility.Visible) ScanCovers();
    }

    /// <summary>
    /// Turn a tenant's category keys into a folder on the music drive.
    ///
    /// DECLARED BEATS DERIVED. When the tenant file names its folders outright —
    /// catalogue.musicDrive and catalogue.studioMusicRoot — they are used as
    /// written, so this and the file cannot disagree about where a label lives.
    ///
    /// Otherwise the key is PROBED for under the catalogue root, as itself and one
    /// level down: the manifest calls the label `party-giggles` and on disk it is
    /// `children\party-giggles`. JubileePraise Studio derives that mapping out of
    /// catalog-manifest.json instead; probing two levels is the same answer for
    /// every tenant that exists, and it does not need the manifest to be present.
    ///
    /// Returns the folder the picker enumerates as "voices" and the names it is
    /// allowed to show. An empty root means "use the configured music root".
    /// </summary>
    private (string Root, List<string> Voices) ResolveTenantScope(TenantOption t)
    {
        if (t.Categories.Count == 0) return ("", new List<string>());

        if (t.StudioMusicRoot.Length > 0 && t.MusicDrive.Length > 0
            && Directory.Exists(t.StudioMusicRoot) && Directory.Exists(t.MusicDrive))
        {
            var leaf = new DirectoryInfo(t.MusicDrive).Name;
            if (leaf.Length > 0) return (t.StudioMusicRoot, new List<string> { leaf });
        }

        var baseDir = MusicBase();
        if (baseDir.Length == 0 || !Directory.Exists(baseDir)) return ("", new List<string>());

        var hits = new List<string>();
        foreach (var key in t.Categories)
        {
            var direct = Path.Combine(baseDir, key.Replace('/', Path.DirectorySeparatorChar));
            if (Directory.Exists(direct)) { hits.Add(direct); continue; }

            try
            {
                var nested = Directory.EnumerateDirectories(baseDir)
                    .Select(d => Path.Combine(d, key))
                    .FirstOrDefault(Directory.Exists);
                if (nested != null) hits.Add(nested);
            }
            catch { /* an unreadable folder costs this tenant its scope, not the app */ }
        }
        if (hits.Count == 0) return ("", new List<string>());

        // Every category of a tenant has sat under one parent so far. If one ever
        // does not, the odd one out is dropped rather than silently widening the
        // scope to a parent that also holds other tenants' labels.
        var parent = Path.GetDirectoryName(hits[0]) ?? "";
        var voices = hits
            .Where(h => string.Equals(Path.GetDirectoryName(h), parent, StringComparison.OrdinalIgnoreCase))
            .Select(h => Path.GetFileName(h)!)
            .ToList();

        return (parent, voices);
    }

    /// <summary>
    /// The catalogue root on the music drive — the folder holding the category
    /// folders and catalog-manifest.json.
    ///
    /// Walked up from the configured music root rather than assumed, because that
    /// setting points one level in (…\music\inspire) and a checkout could just as
    /// easily point it at the root itself.
    /// </summary>
    private string MusicBase()
    {
        var dir = _musicRoot.TrimEnd('\\', '/');
        for (var i = 0; i < 3 && dir.Length > 0; i++)
        {
            if (File.Exists(Path.Combine(dir, "catalog-manifest.json"))) return dir;
            dir = Path.GetDirectoryName(dir) ?? "";
        }
        // No manifest anywhere above it: the parent is still the best guess, since
        // the setting names a category folder.
        return Path.GetDirectoryName(_musicRoot.TrimEnd('\\', '/')) ?? "";
    }

    /// <summary>A voice folder name as a person's name: melody-inspire → Melody Inspire.</summary>
    private static string VoiceDisplay(string folder) =>
        string.Join(' ', folder.Split('-', StringSplitOptions.RemoveEmptyEntries)
            .Select(p => p.Length == 0 ? p : char.ToUpperInvariant(p[0]) + p[1..]));

    // ========================================================================
    //  LAYOUT, CONFIG AND PATHS
    // ========================================================================

    private void ApplyLayout()
    {
        PanelCol.Width = new GridLength(Math.Max(MinPanelWidth, _panelWidth), GridUnitType.Pixel);
        LogRow.Height = new GridLength(Math.Max(MinLogHeight, _logHeight), GridUnitType.Pixel);
    }

    // ========================================================================
    //  WHERE THE WINDOW WAS
    // ========================================================================

    /// <summary>
    /// Put the window back where it was: size, position on the virtual desktop, and
    /// whether it was maximised.
    ///
    /// 🔴 THE SAVED RECTANGLE IS VALIDATED AGAINST THE MONITORS THAT EXIST NOW.
    /// The coordinates are virtual-desktop coordinates, and this machine is a
    /// workstation with a laptop screen, an external monitor and an RDP session
    /// that each present a different desktop. A window last closed at X=2600 on a
    /// second monitor that is no longer attached would be restored completely
    /// off-screen — visible in Alt-Tab, impossible to reach with the mouse, and
    /// indistinguishable from the app failing to start. So the restored rectangle
    /// has to INTERSECT the virtual screen by a usable margin, or it is discarded
    /// and the window centres itself instead.
    ///
    /// Intersection, not containment: a window deliberately left hanging off the
    /// right edge of a screen is a legitimate thing to want restored, and demanding
    /// the whole rectangle fit would move it every time.
    /// </summary>
    /// <summary>
    /// What ApplyWindowPlacement decided, held until InitAsync writes the startup
    /// banner so it appears with the other "where this is reading from" lines
    /// rather than above them.
    ///
    /// Worth logging at all because this machine runs NINE monitors spanning
    /// x = -3843 to 3840: when a window comes back somewhere unexpected, the first
    /// question is whether the saved rectangle was used or rejected, and that is
    /// not answerable from looking at the window.
    /// </summary>
    private string _placementNote = "";

    private void ApplyWindowPlacement()
    {
        if (double.IsNaN(_winWidth) || double.IsNaN(_winHeight))
        {
            _placementNote = "window  first run — centred by Windows";
            return;
        }
        if (_winWidth < MinWindowWidth || _winHeight < MinWindowHeight)
        {
            _placementNote = $"window  saved size {_winWidth:0}x{_winHeight:0} is below the minimum — ignored";
            return;
        }

        var w = _winWidth;
        var h = _winHeight;
        var l = _winLeft;
        var t = _winTop;

        if (!double.IsNaN(l) && !double.IsNaN(t))
        {
            var vl = SystemParameters.VirtualScreenLeft;
            var vt = SystemParameters.VirtualScreenTop;
            var vr = vl + SystemParameters.VirtualScreenWidth;
            var vb = vt + SystemParameters.VirtualScreenHeight;

            // Enough of the window has to be reachable to grab its title bar.
            const double NeedX = 160, NeedY = 40;
            var visibleX = Math.Min(l + w, vr) - Math.Max(l, vl);
            var visibleY = Math.Min(t + h, vb) - Math.Max(t, vt);

            if (visibleX >= NeedX && visibleY >= NeedY)
            {
                WindowStartupLocation = WindowStartupLocation.Manual;
                Left = l;
                Top = t;
                _placementNote = $"window  restored to {l:0},{t:0} {w:0}x{h:0}"
                               + (_winMaximized ? ", maximised" : "");
            }
            else
            {
                // The monitor it was last on is gone, or has moved. Keep the size,
                // drop the position, and let Windows place it somewhere reachable.
                _placementNote = $"window  saved position {l:0},{t:0} is off every current monitor "
                               + $"(virtual desktop {vl:0},{vt:0} to {vr:0},{vb:0}) — size kept, position reset";
            }
        }

        Width = w;
        Height = h;

        // Applied AFTER the bounds, so the restore-down size is the saved one
        // rather than whatever the XAML declared.
        if (_winMaximized) WindowState = WindowState.Maximized;
    }

    /// <summary>
    /// Record the window's placement.
    ///
    /// 🔴 RestoreBounds, NOT Left/Top/Width/Height. While a window is maximised
    /// those four properties report the MAXIMISED rectangle, so saving them would
    /// store the full-screen size as the normal size — and the window would then
    /// never be restorable to the size the user actually chose. RestoreBounds is
    /// the framework's own record of the normal rectangle and is correct in every
    /// state. It is Empty only before the window has been shown.
    ///
    /// A MINIMISED window is stored as its restore state, not as minimised. The
    /// placement is still saved correctly — RestoreBounds survives minimising — but
    /// see ApplyWindowPlacement's caller: reopening straight to the taskbar is
    /// indistinguishable from a launch that failed.
    /// </summary>
    private void SaveWindowPlacement()
    {
        var r = RestoreBounds;
        if (!r.IsEmpty && r.Width >= MinWindowWidth && r.Height >= MinWindowHeight)
        {
            _winLeft = r.Left;
            _winTop = r.Top;
            _winWidth = r.Width;
            _winHeight = r.Height;
        }
        // Minimised is deliberately not a state we persist as itself: a window is
        // either maximised or it is not, and a minimised one reopens normally.
        _winMaximized = WindowState == WindowState.Maximized;
    }

    /// <summary>
    /// Write the current splitter positions back to the config file.
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
        SaveWindowPlacement();
        WriteConfig();
    }

    /// <summary>
    /// Walk up from the binary looking for THIS repo's marker,
    /// core/articles/gen-articles.mjs.
    ///
    /// NO FALLBACK PATH. An earlier build of the sibling tool defaulted its root
    /// to a hard-coded W:\JubileePraise.com when the marker was not found, which
    /// means a stray copy of the exe anywhere on the machine would have written
    /// into that repo. An unresolved root now says which folder it started from
    /// and refuses to scan, which is the recoverable failure.
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
        _toolDir = _root.Length > 0 ? Path.Combine(_root, "wpf", "CoverArtStudio") : AppContext.BaseDirectory;
        _configFile = Path.Combine(_toolDir, "coverart.config.json");
        _studioRoot = _root.Length > 0 ? Path.Combine(_root, "review", "_studio") : "";

        // The WebView2 profile must live on a LOCAL disk. The tool directory is
        // normally on a mapped network share (W: -> \\HDC-INSPIRESERVER\Websites),
        // and Chromium does not support a user data folder on a network path: the
        // browser process faults with STATUS_IN_PAGE_ERROR (0xc0000006) the moment
        // the share goes stale, which kills the pane and then the app. Keep the
        // cookie store next to the user's other local app data instead.
        //
        // ITS OWN FOLDER, NOT THE ONE JubileePraise Studio USES. Two Chromium
        // processes cannot share a user data folder: the second to start fails
        // outright. Sharing the profile would mean the two studios could never be
        // open at the same time, which is exactly when you want both — covers
        // generating in one while the other deploys. The cost is one extra ChatGPT
        // login, once.
        _userDataFolder = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "JubileePraise", "CoverArtStudio", "webview2");
        Directory.CreateDirectory(_userDataFolder);
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
            var m = cfg?["musicRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(m)) _musicRoot = m.TrimEnd('\\', '/');
            var s = cfg?["studioRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(s)) _studioRoot = s.TrimEnd('\\', '/');
            var h = cfg?["heroRoot"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(h)) _heroRoot = h.TrimEnd('\\', '/');
            // Held rather than applied: the tenant list does not exist yet, and an
            // unknown key must fall back to the flagship rather than to nothing.
            var tn = cfg?["tenant"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(tn)) _wantedTenantKey = tn.Trim();
            var loc = cfg?["locationUrl"]?.GetValue<string>();
            if (!string.IsNullOrWhiteSpace(loc)) LocationUrl.Text = loc;

            // Absent means "on", so a config written before a switch existed does
            // not silently turn it off.
            if (cfg?["coverChrome"]?.GetValue<bool>() is bool chrome) ChkCoverChrome.IsChecked = chrome;
            if (cfg?["studioWebp"]?.GetValue<bool>() is bool webp) ChkStudioWebp.IsChecked = webp;

            var layout = cfg?["layout"];
            var pw = layout?["panelWidth"]?.GetValue<double>();
            var lh = layout?["logHeight"]?.GetValue<double>();
            if (pw is double savedWidth && savedWidth >= MinPanelWidth) _panelWidth = savedWidth;
            if (lh is double savedHeight && savedHeight >= MinLogHeight) _logHeight = savedHeight;

            // The window's own placement. Read into fields and applied later, in
            // ApplyWindowPlacement, which is where the saved rectangle is checked
            // against the monitors that actually exist right now.
            var win = cfg?["window"];
            if (win?["left"]?.GetValue<double>() is double wl) _winLeft = wl;
            if (win?["top"]?.GetValue<double>() is double wt) _winTop = wt;
            if (win?["width"]?.GetValue<double>() is double ww) _winWidth = ww;
            if (win?["height"]?.GetValue<double>() is double wh) _winHeight = wh;
            if (win?["maximized"]?.GetValue<bool>() is bool wm) _winMaximized = wm;
        }
        catch { /* a malformed config just means "start from defaults" */ }
    }

    private void BtnSaveCfg_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        // Fold the current splitter positions in too, so "Save settings" saves
        // what the window looks like as well as where it reads from.
        SaveLayout();
        Log($"Settings saved → {_configFile} (git-ignored).");
    }

    private void WriteConfig()
    {
        try
        {
            var cfg = new JsonObject
            {
                ["repoRoot"] = _root,
                ["musicRoot"] = _musicRoot,
                ["studioRoot"] = _studioRoot,
                ["heroRoot"] = HeroRoot,
                ["tenant"] = _tenant?.Key ?? "",
                ["locationUrl"] = string.IsNullOrWhiteSpace(LocationUrl.Text) ? CHATGPT : LocationUrl.Text,
                ["coverChrome"] = ChkCoverChrome.IsChecked == true,
                ["studioWebp"] = ChkStudioWebp.IsChecked == true,
                ["layout"] = new JsonObject
                {
                    ["panelWidth"] = Math.Round(_panelWidth),
                    ["logHeight"] = Math.Round(_logHeight),
                },
                // Virtual-desktop coordinates, so they can legitimately be negative
                // — a monitor to the left of the primary one has negative X. Written
                // only when there is something to write, so a config from before
                // this existed does not gain a block of NaNs.
                ["window"] = double.IsNaN(_winWidth) ? null : new JsonObject
                {
                    ["left"] = double.IsNaN(_winLeft) ? null : Math.Round(_winLeft),
                    ["top"] = double.IsNaN(_winTop) ? null : Math.Round(_winTop),
                    ["width"] = Math.Round(_winWidth),
                    ["height"] = Math.Round(_winHeight),
                    ["maximized"] = _winMaximized,
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
        _studioRoot = (StudioRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        _heroRoot = (HeroRootBox.Text ?? "").Trim().TrimEnd('\\', '/');

        var music = (MusicRoot.Text ?? "").Trim().TrimEnd('\\', '/');
        // Moving the music root moves every tenant's scope with it, so the
        // resolved scope is dropped rather than left pointing at folders on the
        // old drive.
        if (!string.Equals(music, _musicRoot, StringComparison.OrdinalIgnoreCase))
        {
            _musicRoot = music;
            if (_tenant != null) ApplyTenant(_tenant, rescan: false);
        }
    }

    // ---- init WebView2 with a persistent profile (this is the cookie store) -
    private async Task InitAsync()
    {
        // The banner and the first scan happen BEFORE the browser is touched, and
        // that order is deliberate. Album Covers is the view the window opens on,
        // and Rail_Checked cannot fill it: that handler fires during
        // InitializeComponent, while _coverUiBuilt is still false, so its scan is
        // suppressed and nothing else asks for one. Left to the browser's own
        // try block, a WebView2 failure would also cost the user a worklist that
        // has nothing to do with the browser.
        Log("Jubilee Cover Art Studio");
        if (_placementNote.Length > 0) Log("  " + _placementNote);
        Log($"  repo    {(_root.Length > 0 ? _root : "NOT FOUND — set it in Settings")}");
        Log($"  music   {EffectiveMusicRoot}{(Directory.Exists(EffectiveMusicRoot) ? "" : "   ⚠ not found on this machine")}");
        Log($"  covers  → {ReviewRoot}\\<Persona>\\   (for approval, never straight to the music drive)");
        Log($"  studio  → {_studioRoot}");
        Log($"  website {_tenant?.Name ?? "JubileePraise.com"} — {(_tenantVoices.Count > 0 ? string.Join(", ", _tenantVoices) : "whole catalogue")}, from {TenantSourceLabel()}.");
        Log("");
        ScanCovers();
        Log("");

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
            BrowserVeil.Visibility = Visibility.Collapsed;

            Log("Log in to ChatGPT in the browser on the left, then press Generate.");
        }
        catch (Exception ex)
        {
            Log("Init failed: " + ex.Message);
            VeilStatus.Text = "WebView2 failed to start.\n" + ex.Message;
            MessageBox.Show(
                "WebView2 failed to start. Make sure the WebView2 Runtime is installed " +
                "(it ships with Edge on Windows 11).\n\n" + ex.Message,
                "Jubilee Cover Art Studio", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ========================================================================
    //  SHARED BUTTONS
    // ========================================================================

    private void BtnStop_Click(object sender, RoutedEventArgs e)
    {
        _cts?.Cancel();
        Log("Stopping after the current image…");
    }

    private bool EnsureReady()
    {
        if (!_ready) { Log("Browser not ready yet."); return false; }
        ReadRootFromUi();
        return true;
    }

    private async void BtnOpenChatGpt_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) { Log("Browser not ready yet."); return; }
        await NavigateAndWait(CHATGPT, CancellationToken.None);
    }

    /// <summary>
    /// Drop the embedded browser's cookies and site data.
    ///
    /// Uses the profile's own Clear API rather than deleting the folder: the
    /// folder is locked while the browser is running, so a delete would either
    /// fail or leave a half-removed profile that will not load next launch.
    /// </summary>
    private async void BtnClearProfile_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) { Log("Browser not ready yet."); return; }
        var answer = MessageBox.Show(
            "Sign out of ChatGPT in this app's browser?\n\nYou will have to log in again before the next run.",
            "Jubilee Cover Art Studio", MessageBoxButton.OKCancel, MessageBoxImage.Question);
        if (answer != MessageBoxResult.OK) return;
        try
        {
            // AllSite, which is cookies plus every per-origin store — local
            // storage, IndexedDB, service workers. Cookies alone is not a sign-out:
            // ChatGPT keeps enough in local storage to walk straight back into the
            // session, so clearing only the cookie jar leaves the user logged in
            // and the button looking broken.
            await Wv.CoreWebView2.Profile.ClearBrowsingDataAsync(
                CoreWebView2BrowsingDataKinds.AllSite);
            Log("Signed out — cookies and site data cleared for this profile.");
            await NavigateAndWait(CHATGPT, CancellationToken.None);
        }
        catch (Exception ex) { Log("Could not clear the profile: " + ex.Message); }
    }

    /// <summary>
    /// Lock the "generation location" to the page the browser is on — meant for a
    /// ChatGPT Projects page, so every generation conversation is created inside
    /// that project. If you are inside a chat within the project, it normalises
    /// back to the project's new-chat page.
    /// </summary>
    private async void BtnUseLocation_Click(object sender, RoutedEventArgs e)
    {
        if (!_ready) { Log("Browser not ready yet."); return; }
        // Read the LIVE address from the page. ChatGPT is a single-page app, so
        // CoreWebView2.Source lags behind client-side navigation (clicking a
        // project/chat in the sidebar) — window.location.href is always current.
        var src = Json(await Wv.CoreWebView2.ExecuteScriptAsync("window.location.href"));
        if (string.IsNullOrWhiteSpace(src)) src = Wv.CoreWebView2.Source ?? "";
        var m = Regex.Match(src, @"^(https://chatgpt\.com/g/g-p-[^/]+)/");
        if (m.Success) src = m.Groups[1].Value + "/project";
        if (!string.IsNullOrWhiteSpace(src)) { LocationUrl.Text = src; Log("Generation location set → " + src); }
    }

    private void Open(string path)
    {
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(path) { UseShellExecute = true }); }
        catch (Exception ex) { Log("Could not open the folder: " + ex.Message); }
    }

    // ========================================================================
    //  THE BATCH DRIVER
    // ========================================================================
    //
    // Both views feed this. Covers and free generations differ only in which
    // worklist gets re-rendered as each picture lands and what is worth saying at
    // the end; the pacing, the escalating cooldown, the three-strikes stop and the
    // policy handling are shared, because they are properties of the ChatGPT web
    // UI rather than of what is being drawn.

    private async Task RunBatch(List<Job> jobs, Kind view)
    {
        if (_running) { Log("Already running — press Stop first."); return; }
        _running = true;
        _cts = new CancellationTokenSource();
        SetBusy(true);
        int done = 0, skipped = 0, failed = 0, inThread = 0, consecutiveFailures = 0;
        try
        {
            for (int i = 0; i < jobs.Count; i++)
            {
                _cts.Token.ThrowIfCancellationRequested();
                var job = jobs[i];

                // Never regenerate one already done (this session or a prior run).
                if (_completedPaths.Contains(job.Path))
                {
                    Log($"[{i + 1}/{jobs.Count}] {job.Title} — already done, skipping.");
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

                    // Tick it now, not at the end of the run. A sweep of a whole
                    // persona takes hours, and a worklist that only updates when the
                    // run finishes tells the user nothing while it runs.
                    _sessionDone.Add(job.Path);
                    // Show the image that just landed. The user is watching a long
                    // run; the picture arriving is the thing worth seeing.
                    if (view == Kind.Cover) { RenderCovers(); ShowCoverPreviewFile(job.OutFile, job.Title); }
                    else if (view == Kind.Hero) { job.HeroFile = job.OutFile; ShowHeroPreviewFile(job.OutFile, job.Title + "  —  hero"); }
                    else { ScanStudio(); ShowStudioPreviewFile(job.OutFile); }

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
                    // THE NEXT JOB STARTS A FRESH CONVERSATION. A failure is very
                    // often the thread itself — wedged, streaming forever, or
                    // holding an unsent prompt — and leaving inThread where it was
                    // sends the next job straight back into it. That is how ONE
                    // stuck conversation used to consume three jobs and the best
                    // part of twenty minutes before the run gave up.
                    inThread = 0;
                    // Three failures in a row is not bad luck. It is almost always
                    // a quota or a capacity problem, and grinding through the
                    // remaining jobs would just burn them all against the same wall
                    // and mark none of them done.
                    if (++consecutiveFailures >= 3)
                    {
                        Log("\n  ✗ Three failures in a row — stopping the run.");
                        Log("    This is usually an image quota or a temporary ChatGPT capacity problem.");
                        Log("    Nothing was lost: everything that failed is still marked pending.");
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
            if (view == Kind.Cover) ScanCovers(); else if (view == Kind.Hero) ScanHeroes(); else ScanStudio();

            Log($"\nFinished. {done} generated"
                + (failed > 0 ? $", {failed} failed" : "")
                + (skipped > 0 ? $", {skipped} skipped (already done)" : "") + ".");
            if (done > 0 && view == Kind.Cover)
            {
                Log("Nothing here is reviewed automatically — look at every cover before it ships.");
                Log($"They are DRAFTS in {ReviewRoot}. Move the one you want into the album's artwork\\");
                Log("folder by hand; nothing on the music drive has been touched.");
            }
            else if (done > 0 && view == Kind.Hero)
            {
                Log("Nothing here is reviewed automatically — look at every hero before it ships.");
                Log($"These were written INTO THE WEBSITE at {HeroRoot} and are servable immediately at");
                Log("/images/heroes/<persona>/<CODE>.webp — check them, then commit and deploy.");
            }
            else if (done > 0)
            {
                Log($"Nothing here is reviewed automatically — the pictures are in {_studioRoot}.");
            }
        }
    }

    /// <summary>
    /// Generate one job: build its prompt if it does not have one yet, attach any
    /// references, submit, wait, save.
    ///
    /// The prompt for a COVER is built here rather than at scan time because
    /// building it costs a lyrics-file read, which is worth paying for the album
    /// about to be generated and not for the eight hundred that are not.
    /// </summary>
    private async Task<bool> GenerateOne(Job job, bool newThread, CancellationToken ct)
    {
        if (job.Kind == Kind.Cover && !PrepareCover(job))
        {
            Log($"  ✗ Could not build a prompt: no generation brief for {job.Artist} in .models.");
            return false;
        }
        if (job.Kind == Kind.Hero && !PrepareHero(job))
        {
            Log($"  ✗ Could not build a prompt for {job.Title} — its cover is missing from the artwork folder.");
            return false;
        }
        if (job.Prompt.Length == 0) { Log("  ✗ No prompt on this job — skipping."); return false; }

        var first = await AttemptOne(job, newThread, job.Prompt, ct);
        if (first.Src != null) return await SaveImage(first.Src, job, ct);

        // The content filter refused the PROMPT. A fresh conversation cannot help,
        // because the prompt is what was rejected and it would be rejected again.
        // Rewrite it and resubmit, softening one more likely trigger each pass.
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
                await Task.Delay(pause, ct);

                var retry = await AttemptOne(job, true, rewritten, ct);
                if (retry.Src != null)
                {
                    // Nothing is written back. A cover prompt is BUILT from .models
                    // and the album on every run, and a studio prompt lives in the
                    // box the user typed it into — neither has a file to correct.
                    // So the wording that worked is worth seeing in the log.
                    Log("  The wording that got through:");
                    Log("    " + (rewritten.Length > 300 ? rewritten[..300] + "…" : rewritten));
                    if (job.Kind == Kind.Cover)
                        Log("  If this album keeps tripping the filter, adjust its persona's generation brief.");
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
            Log("  ✗ The content filter refused every rewrite. Leaving this one queued and untouched.");
            return false;
        }

        // A turn that died on ChatGPT's own failure banner is worth one more go,
        // but in a BRAND NEW conversation. The page's Retry button re-runs the same
        // wedged turn and tends to fail the same way; a fresh thread gets a fresh
        // one. Every other kind of miss falls straight through, because resending
        // an identical prompt would just burn another turn.
        if (first.PageFailed)
        {
            var pause = _rng.Next(30000, 60001);
            Log($"  That conversation is wedged. Starting a fresh one in {pause / 1000}s and trying this one more time…");
            await Task.Delay(pause, ct);
            var second = await AttemptOne(job, true, job.Prompt, ct);
            if (second.Src != null) return await SaveImage(second.Src, job, ct);
        }
        return false;
    }

    /// <summary>
    /// Soften one more likely content-filter trigger per pass.
    ///
    /// Ported unchanged from JubileePraise Studio. The passes are cumulative and
    /// ordered least-destructive first: the aim is the same picture in wording the
    /// filter will accept, not a different picture.
    /// </summary>
    private static string SanitizeForFilter(string prompt, int pass)
    {
        var s = prompt;

        // Pass 1 — named real people and brands. The commonest single trigger.
        if (pass >= 1)
        {
            s = Regex.Replace(s, @"\bphotorealistic\b", "richly detailed", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bhyper-?realistic\b", "richly detailed", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bphotograph(y|ic)?\b", "picture", RegexOptions.IgnoreCase);
        }
        // Pass 2 — anything that reads as a real, identifiable person.
        if (pass >= 2)
        {
            s = Regex.Replace(s, @"\blikeness\b", "character design", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bthe same individual\b", "a consistent character", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bface and likeness\b", "character design", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bunmistakably the same\b", "visually consistent with the", RegexOptions.IgnoreCase);
        }
        // Pass 3 — bodies and ages, which the filter reads conservatively.
        if (pass >= 3)
        {
            s = Regex.Replace(s, @"\bslender and lean\b", "of an athletic build", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bslim waist\b", "an athletic frame", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bTHIRTY years old[^.]*\.", "an adult.", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bFORTY years old[^.]*\.", "an adult with white hair.", RegexOptions.IgnoreCase);
        }
        // Pass 4 — religious and ceremonial nouns that can read as real-world
        // institutions.
        if (pass >= 4)
        {
            s = Regex.Replace(s, @"\bcoronation\b", "celebration", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bthrone room\b", "grand hall", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"\bcathedral\b", "great hall", RegexOptions.IgnoreCase);
        }
        // Pass 5 — last resort: drop every attachment instruction, so the turn
        // stands on the description alone.
        if (pass >= 5)
        {
            s = Regex.Replace(s, @"The attached images[^.]*\.", "", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"COPY EXACTLY from them:[^.]*\.", "", RegexOptions.IgnoreCase);
            s = Regex.Replace(s, @"This OVERRIDES the attached reference images[^.]*\.", "", RegexOptions.IgnoreCase);
        }

        return Regex.Replace(s, @"\s{2,}", " ").Trim();
    }

    // ========================================================================
    //  UI PLUMBING
    // ========================================================================

    private static readonly Random _rng = new();

    private void SetBusy(bool busy)
    {
        // Both views drive the same browser and the same runner, so a run started
        // in either has to lock BOTH Generate buttons. Leaving the other one live
        // during a run would let a second batch start against a page already
        // mid-generation, and RunBatch would refuse it — after the user had every
        // reason to think it had begun.
        BtnCoversGenerate.IsEnabled = !busy;
        BtnCoversRefresh.IsEnabled = !busy;
        BtnCoversStop.IsEnabled = busy;
        BtnStudioGenerate.IsEnabled = !busy;
        BtnStudioRefresh.IsEnabled = !busy;
        BtnStudioStop.IsEnabled = busy;
        BtnHeroesGenerate.IsEnabled = !busy;
        BtnHeroesRefresh.IsEnabled = !busy;
        BtnHeroesStop.IsEnabled = busy;
        BtnHeroMarkRedo.IsEnabled = !busy;
    }

    private void Log(string msg)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(() => Log(msg)); return; }
        LogBox.AppendText(msg + "\n");
        LogBox.ScrollToEnd();
    }

    /// <summary>
    /// Decode an image for the preview panes.
    ///
    /// OnLoad and a MemoryStream, not a file URI: BitmapImage holds a file open
    /// for as long as the bitmap lives when handed a path, which would stop the
    /// next run overwriting the picture it is previewing.
    ///
    /// WebP goes through ImageSharp. WIC has no registered WebP decoder on this
    /// machine, so BitmapImage throws a bare "Key cannot be null" on every .webp —
    /// which is exactly the format the Image Studio saves by default.
    /// </summary>
    private static (BitmapSource Image, int Width, int Height) LoadPreview(string file)
    {
        var bytes = File.ReadAllBytes(file);

        if (Path.GetExtension(file).Equals(".webp", StringComparison.OrdinalIgnoreCase))
        {
            using var img = SixLabors.ImageSharp.Image.Load(bytes);
            using var ms = new MemoryStream();
            img.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
            ms.Position = 0;
            var decoded = new BitmapImage();
            decoded.BeginInit();
            decoded.CacheOption = BitmapCacheOption.OnLoad;
            decoded.StreamSource = ms;
            decoded.EndInit();
            decoded.Freeze();
            return (decoded, img.Width, img.Height);
        }

        var bmp = new BitmapImage();
        bmp.BeginInit();
        bmp.CacheOption = BitmapCacheOption.OnLoad;
        bmp.StreamSource = new MemoryStream(bytes);
        bmp.EndInit();
        bmp.Freeze();
        return (bmp, bmp.PixelWidth, bmp.PixelHeight);
    }

    /// <summary>
    /// A small, frozen thumbnail for a gallery row.
    ///
    /// DecodePixelWidth is the load-bearing part: the gallery can hold hundreds of
    /// 1024px pictures, and decoding those at full size to draw them at 40px would
    /// cost hundreds of megabytes for no visible difference. Returns null rather
    /// than throwing — a row with no thumbnail is still a usable row.
    /// </summary>
    private static BitmapSource? LoadThumb(string file)
    {
        try
        {
            if (Path.GetExtension(file).Equals(".webp", StringComparison.OrdinalIgnoreCase))
            {
                using var img = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(file));
                img.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
                {
                    Mode = SixLabors.ImageSharp.Processing.ResizeMode.Crop,
                    Size = new SixLabors.ImageSharp.Size(80, 80),
                }));
                using var ms = new MemoryStream();
                img.Save(ms, new SixLabors.ImageSharp.Formats.Png.PngEncoder());
                ms.Position = 0;
                var decoded = new BitmapImage();
                decoded.BeginInit();
                decoded.CacheOption = BitmapCacheOption.OnLoad;
                decoded.StreamSource = ms;
                decoded.EndInit();
                decoded.Freeze();
                return decoded;
            }

            var bmp = new BitmapImage();
            bmp.BeginInit();
            bmp.CacheOption = BitmapCacheOption.OnLoad;
            bmp.DecodePixelWidth = 80;
            bmp.StreamSource = new MemoryStream(File.ReadAllBytes(file));
            bmp.EndInit();
            bmp.Freeze();
            return bmp;
        }
        catch { return null; }
    }

    /// <summary>
    /// A filename Windows will accept. Album titles carry colons, question marks
    /// and slashes — "Jesus, You Are the River (HIT SINGLE)" is a real one — and
    /// any of those would throw on write and lose the render.
    /// </summary>
    private static string FileSafe(string s)
    {
        var clean = new string(s.Select(c => Path.GetInvalidFileNameChars().Contains(c) ? ' ' : c).ToArray());
        clean = Regex.Replace(clean, @"\s+", " ").Trim().TrimEnd('.');
        return clean.Length == 0 ? "untitled" : clean;
    }
}
