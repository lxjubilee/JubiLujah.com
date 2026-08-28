using System.IO;
using System.Text;
using System.Windows;
using System.Windows.Controls;

namespace JubileePraiseStudio;

// ============================================================================
//  SUPPORT IMAGES
// ============================================================================
//
// The fifth view. A SUPPORTING image is not a cover and it is not an article
// picture: it is the album's own cover art, opened out.
//
// WHAT IT IS FOR. The album page — /album?c=<CODE>, where the song titles are
// listed and played — shows a square cover and then a list of tracks. The
// supporting image is the wide band above that list: the same person, in the
// same place, in the same world the cover established, a beat later and with the
// frame opened up. It has to read as the cover's own photograph rather than as a
// stock banner, which is why the cover itself is attached to the turn.
//
// WHY THIS IS NOT "COVER IMAGES AT 16:9".
//
//   1. A cover is INVENTED from a persona brief. A supporting image is DERIVED
//      from a picture that already exists: the album's own cover master is
//      attached, and the prompt's whole job is to KEEP it — the person, the
//      wardrobe, the location, the palette, the hour of the day — and to change
//      only the framing and the moment.
//
//   2. AN ALBUM WITHOUT A COVER IS NOT ELIGIBLE, which is the exact inverse of
//      the Covers queue. There is nothing to derive from. Covers lists albums
//      MISSING artwork; this one lists albums that HAVE it.
//
//   3. It ships as WEBP, not PNG. This picture's destination is a web page and
//      the CDN, not the archive, and every other image the site serves is WebP.
//
//   4. There is no house chrome. A cover carries a border, a wordmark and the
//      album title; a supporting image carries none of them, because it sits
//      directly under an album title the page has already rendered in real text.
//      Baked-in lettering is exactly the failure ApplyChrome exists to prevent.
//
// THE LOOK IS THE ECOSYSTEM'S, NOT A NEW ONE. Warm golden light and a scene full
// of life, in the wording already running on InspireManna.com — carried across
// verbatim in GoldenLook and JoyLook below rather than paraphrased, because a
// paraphrase is how two properties end up "both warm" and visibly different.
//
// OUTPUT GOES STRAIGHT TO THE MUSIC DRIVE — Founder decision, 2026-08-17 — and
// that differs from Covers deliberately:
//
//     <album>/artwork/<CODE>-support-<N>.webp
//
// Drafts land numbered side by side and THE LOWEST-NUMBERED SURVIVOR IS WHAT THE
// WEBSITE SHOWS, so deleting the drafts you do not want IS the approval step.
// Unlike a cover, nothing here can overwrite an approved master: the name carries
// -support- and no other part of the system reads that suffix.

public partial class MainWindow
{
    /// <summary>Section key for support jobs. Never one of the four article sections.</summary>
    private const string SupportSection = "Support Images";

    /// <summary>Albums with a cover, each with a supporting-image job attached.</summary>
    private readonly List<Piece> _supports = new();

    /// <summary>
    /// False until the constructor has finished, for the same reason
    /// <see cref="_coverUiBuilt"/> is: filling the persona picker fires the
    /// selection handler while the window is still being built, and walking the
    /// music drive from inside the constructor would delay every launch.
    /// </summary>
    private bool _supportUiBuilt;

    // ---- where they land ----------------------------------------------------

    /// <summary>
    /// &lt;album&gt;/artwork/&lt;CODE&gt;-support-&lt;N&gt;.webp
    ///
    /// Beside the cover master rather than in a folder of its own: the album
    /// folder is what the CDN push walks, and a supporting image kept somewhere
    /// else would need a second path taught to every tool that syncs.
    /// </summary>
    private static string SupportPathFor(string artDir, string code, int draft) =>
        Path.Combine(artDir, $"{code}-support-{draft}.webp");

    /// <summary>
    /// Extensions that count as an existing supporting image. WebP is what this
    /// tool writes; the others are here so a hand-placed file is not generated
    /// over.
    /// </summary>
    private static readonly string[] SupportExts = { ".webp", ".png", ".jpg", ".jpeg", ".avif" };

    /// <summary>The draft number off a support filename, or int.MaxValue if unparseable.</summary>
    private static int SupportDraftNumberOf(string file)
    {
        var stem = Path.GetFileNameWithoutExtension(file);
        var cut = stem.LastIndexOf('-');
        return cut >= 0 && int.TryParse(stem[(cut + 1)..], out var n) ? n : int.MaxValue;
    }

    /// <summary>
    /// The LOWEST-NUMBERED supporting image for an album code, or "" when there is
    /// none.
    ///
    /// Lowest-numbered on purpose, and it is the same rule the website follows.
    /// Four drafts land as -support-1 … -support-4; deleting the three you do not
    /// want promotes the survivor without a rename, and if 1 and 2 both go then 3
    /// becomes the album's image. That makes deletion the approval gesture, which
    /// is the one gesture nobody can get half-right.
    /// </summary>
    private static string ExistingSupport(string artDir, string code)
    {
        if (!Directory.Exists(artDir)) return "";
        try
        {
            return Directory.EnumerateFiles(artDir, code + "-support-*.*")
                .Where(f => SupportExts.Contains(Path.GetExtension(f), StringComparer.OrdinalIgnoreCase))
                .OrderBy(SupportDraftNumberOf)
                .Select(f => Path.GetFileName(f)!)
                .FirstOrDefault() ?? "";
        }
        catch { return ""; }
    }

    // ---- the panel's small controls -----------------------------------------

    private void FillSupportPersonaPicker()
    {
        if (CmbSupportPersona == null) return;
        CmbSupportPersona.Items.Clear();
        CmbSupportPersona.Items.Add(new ComboBoxItem { Content = "All personas", Tag = "" });
        if (Directory.Exists(EffectiveMusicRoot))
        {
            foreach (var dir in Directory.EnumerateDirectories(EffectiveMusicRoot).OrderBy(d => d, StringComparer.OrdinalIgnoreCase))
            {
                var name = Path.GetFileName(dir);
                if (name.StartsWith('_') || name.StartsWith('.')) continue;
                if (!VoiceAllowed(name)) continue;   // the header's tenant picker
                CmbSupportPersona.Items.Add(new ComboBoxItem { Content = VoiceDisplay(name), Tag = name });
            }
        }
        CmbSupportPersona.SelectedIndex = 0;
    }

    private string SelectedSupportVoice() => (CmbSupportPersona?.SelectedItem as ComboBoxItem)?.Tag as string ?? "";

    private void CmbSupportPersona_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_supportUiBuilt) return;
        ScanSupport();
    }

    private void BtnSupportRefresh_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        _register.Clear();   // pick up edits to the .models register without a restart
        _themes.Clear();
        _genres.Clear();
        _sessionDone.Clear();
        _completedPaths.Clear();
        ScanSupport();
    }

    private void ChkSupportShowAll_Click(object sender, RoutedEventArgs e) => RenderSupport();

    /// <summary>
    /// Language scope, so it re-SCANS rather than re-rendering — see
    /// ChkCoversEnglishOnly_Click for why the two switches are not symmetrical.
    /// </summary>
    private void ChkSupportEnglishOnly_Click(object sender, RoutedEventArgs e)
    {
        if (!_supportUiBuilt) return;
        ScanSupport();
    }

    private void BtnSupportOpen_Click(object sender, RoutedEventArgs e)
    {
        if (SelectedSupport() is not { } p || p.TargetDir.Length == 0) { Log("Select an album first."); return; }
        Open(Directory.Exists(p.TargetDir) ? p.TargetDir : p.AlbumDir);
    }

    private int SelectedSupportDraftCount() =>
        int.TryParse((CmbSupportDrafts?.SelectedItem as ComboBoxItem)?.Tag as string, out var n) ? Math.Max(1, n) : 2;

    // ---- the scan -----------------------------------------------------------

    /// <summary>
    /// Every album under the selected persona that HAS a cover, and whether it
    /// already has a supporting image beside it.
    ///
    /// The eligibility test is the inversion that defines this view: an album with
    /// no artwork is not listed at all, because the cover is the reference and
    /// there is nothing to derive a companion picture from. It is not "pending" —
    /// it belongs to the Covers view until it has one.
    ///
    /// Cheap for the reason ScanCovers is: folders, one meta file, and a directory
    /// listing of artwork/. The lyrics are read once, for one album, at the moment
    /// its prompt is built.
    /// </summary>
    private void ScanSupport()
    {
        _supports.Clear();
        if (_root.Length == 0 || !Directory.Exists(EffectiveMusicRoot))
        {
            Log($"Music root not found: {EffectiveMusicRoot}");
            RenderSupport();
            return;
        }

        var only = SelectedSupportVoice();
        var voices = Directory.EnumerateDirectories(EffectiveMusicRoot)
            .Select(Path.GetFileName)
            .Where(n => n is { Length: > 0 } && !n.StartsWith('_') && !n.StartsWith('.'))
            .Where(VoiceAllowed)
            .Where(n => only.Length == 0 || string.Equals(n, only, StringComparison.OrdinalIgnoreCase))
            .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var englishOnly = ChkSupportEnglishOnly?.IsChecked != false;

        int missing = 0, have = 0, skippedLang = 0, noCover = 0;
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
                var cover = ExistingCover(artDir, code);
                // No cover, no companion. Not an error and not a queue entry — the
                // album simply belongs to the Covers view first.
                if (cover.Length == 0) { noCover++; continue; }

                var existing = ExistingSupport(artDir, code);
                if (existing.Length > 0) have++; else missing++;

                _supports.Add(new Piece
                {
                    Path = dir + "#support",       // completion key, distinct from the cover job's
                    AlbumDir = dir,
                    TargetDir = artDir,
                    Slug = code,
                    Section = SupportSection,
                    Kind = Kind.Support,
                    Title = $"{code} · {AlbumTitleOf(dir, folder)}",
                    Author = VoiceDisplay(voice!),
                    AuthorSlug = voice!.Split('-')[0].ToLowerInvariant(),
                    ImageFile = existing,
                    CoverFile = Path.Combine(artDir, cover),
                    SupportFile = SupportPathFor(artDir, code, 1),
                    // Built at generation time: it costs a lyrics-file read per
                    // album and almost none of these will be generated this session.
                    Prompt = "",
                });
            }
        }

        Log($"Support images: {_supports.Count} {(englishOnly ? "English " : "")}album(s) with artwork under "
            + $"{(only.Length == 0 ? "all personas" : VoiceDisplay(only))} — "
            + $"{missing} with no supporting image, {have} already done."
            + (noCover > 0 ? $"  ({noCover} skipped — no cover to derive one from.)" : "")
            + (skippedLang > 0 ? $"  ({skippedLang} localised edition(s) hidden.)" : ""));
        Log(@"  Output: <album>\artwork\<CODE>-support-<N>.webp on the music drive, 16:9 WebP.");
        Log("  The lowest-numbered draft is the one the website shows — delete the rest to choose.");

        RenderSupport();
    }

    // ---- the worklist -------------------------------------------------------

    private void RenderSupport()
    {
        if (LstSupport == null) return;
        var showAll = ChkSupportShowAll?.IsChecked == true;

        var rows = new List<Row>();
        foreach (var p in _supports)
        {
            var fresh = _sessionDone.Contains(p.Path);
            if (p.HasImage && !showAll && !fresh) continue;

            var (mark, brush) =
                fresh ? ("✓", TickFresh)
                : p.HasImage ? ("✓", TickOld)
                : ("", System.Windows.Media.Brushes.Transparent);

            rows.Add(new Row { Mark = mark, MarkBrush = brush, Title = p.Title, Piece = p });
        }

        if (rows.Count == 0)
        {
            var scope = ChkSupportEnglishOnly?.IsChecked != false ? " English" : "";
            rows.Add(new Row
            {
                Title = _supports.Count == 0
                    ? $"No{scope} album here has a cover to build a supporting image from."
                    : $"Every{scope} album here already has a supporting image.",
                MarkBrush = RowPlain,
            });
        }

        LstSupport.ItemsSource = rows;
    }

    private Piece? SelectedSupport() => (LstSupport?.SelectedItem as Row)?.Piece;

    private void LstSupport_SelectionChanged(object sender, SelectionChangedEventArgs e) => ShowSupportPreview(SelectedSupport());

    /// <summary>
    /// The preview: THE COVER AND THE SUPPORTING IMAGE, SIDE BY SIDE.
    ///
    /// Both at once, always, and that is the point rather than a layout choice.
    /// Whether a supporting image actually belongs to its album is the one thing
    /// nothing here can verify — the file lands in the right folder under the
    /// right name whatever the picture shows, so a drifted image is correct by
    /// every check a machine can make and wrong to the only eye that matters.
    /// Seen together it takes a second: a riverbank cover beside a stone
    /// amphitheatre full of people is unmistakable. Seen apart, neither picture
    /// looks wrong.
    ///
    /// The left pane is also what the next generation will be built FROM, so on a
    /// pending album it is not a placeholder — it is the reference.
    /// </summary>
    private void ShowSupportPreview(Piece? p)
    {
        if (SupportPreviewImage == null || SupportPreviewEmpty == null || SupportPreviewCaption == null) return;
        if (SupportCoverImage == null || SupportCoverEmpty == null) return;

        SupportPreviewImage.Source = null;
        SupportCoverImage.Source = null;
        SupportCoverEmpty.Text = "cover";

        if (p == null)
        {
            SupportPreviewEmpty.Text = "Select an album to preview its supporting image";
            SupportPreviewCaption.Text = "";
            return;
        }

        // LEFT: the cover, which is the reference.
        if (p.CoverFile.Length > 0 && File.Exists(p.CoverFile))
        {
            try
            {
                var (cov, _, _) = LoadPreview(p.CoverFile);
                SupportCoverImage.Source = cov;
                SupportCoverEmpty.Text = "";
            }
            catch { SupportCoverEmpty.Text = "cover unreadable"; }
        }
        else
        {
            SupportCoverEmpty.Text = "no cover";
        }

        // RIGHT: the supporting image, once there is one.
        if (!p.HasImage)
        {
            SupportPreviewEmpty.Text = "No supporting image yet — the cover on the left is what it will be built from";
            SupportPreviewCaption.Text = p.Title;
            return;
        }

        var file = Path.Combine(p.TargetDir, p.ImageFile);
        if (!File.Exists(file))
        {
            SupportPreviewEmpty.Text = "The file this album is marked with is not on disk";
            SupportPreviewCaption.Text = p.Title;
            return;
        }

        try
        {
            // LoadPreview decodes through ImageSharp, which is the only thing on
            // this machine that reads WebP — WIC has no registered decoder and
            // BitmapImage fails with a bare "Key cannot be null".
            var (bmp, w, h) = LoadPreview(file);
            SupportPreviewImage.Source = bmp;
            SupportPreviewEmpty.Text = "";
            SupportPreviewCaption.Text = $"{p.Title}   —   {p.ImageFile} ({w}x{h}).  Does it belong to the cover on the left?";
        }
        catch (Exception ex)
        {
            SupportPreviewEmpty.Text = "Could not read the image";
            SupportPreviewCaption.Text = ex.Message;
        }
    }

    // ---- the look -----------------------------------------------------------

    /// <summary>
    /// The house look, carried across from InspireManna.com's
    /// runner/persona-image.js (its GOLDEN constant) VERBATIM rather than
    /// paraphrased.
    ///
    /// It is a named grade, not the word "warm", and that distinction was measured
    /// there rather than guessed: the corpus once ended "Photographic, warm,
    /// unposed, 16:9" and produced 0% golden or amber wording across 138 prompts,
    /// which is a look that varies image to image instead of being recognisable.
    /// Three things have to be present for it to land — where the light comes from
    /// and what it does, the palette, and the grade.
    ///
    /// The "16:9" the original ends on is dropped here: the ratio is the LAST
    /// instruction sent (see SupportSuffix), and stating it twice in two places is
    /// how a prompt ends up arguing with itself.
    /// </summary>
    private const string GoldenLook =
        "Warm golden light through the whole frame, low and raking as at first light or late afternoon, " +
        "falling across faces and catching dust and edges. Warm amber, honey and soft gold tones in the " +
        "grade, deep gentle shadows, nothing cold, grey, clinical or blue washed. " +
        "Rich cinematic film still, photographic, unposed.";

    /// <summary>
    /// Also carried across from InspireManna's JOY constant. A supporting image
    /// sits directly above a play button: it is an invitation to listen, so the
    /// emotional register is fixed here rather than left to whatever a given
    /// album's theme happens to imply.
    /// </summary>
    private const string JoyLook =
        "The whole scene is happy, warm and full of life: real laughter, delight, energy and ease, " +
        "people plainly enjoying themselves and enjoying each other. This is life after the valley, " +
        "the goodness and blessing of God being lived and enjoyed, never sorrow, illness, grieving, " +
        "poverty, loneliness or hardship, and nothing sombre, downcast, clinical or bleak anywhere in the frame.";

    /// <summary>
    /// The same register for a picture with no crowd in it — ADAPTED from JoyLook,
    /// not carried across verbatim, and the difference is deliberate.
    ///
    /// JoyLook's second clause asks for "people plainly enjoying themselves and
    /// enjoying each other", which is a REQUIREMENT FOR PEOPLE hiding inside a
    /// mood instruction. On a solitary cover it silently reintroduces the crowd
    /// the rest of the prompt just refused, and the refusal loses — a positive
    /// description always beats a prohibition. Everything else is unchanged, so
    /// the emotional register of the two surfaces still matches.
    /// </summary>
    private const string JoyLookSolo =
        "The whole scene is happy, warm and full of life: delight, energy and ease, and real pleasure in " +
        "the moment. This is life after the valley, the goodness and blessing of God being lived and " +
        "enjoyed, never sorrow, illness, grieving, poverty, loneliness or hardship, and nothing sombre, " +
        "downcast, clinical or bleak anywhere in the frame.";

    /// <summary>
    /// One draft angle, and whether it can only be staged with other people in it.
    ///
    /// The flag is the whole reason this is a record and not a string. An angle
    /// that demands a crowd is unusable on an album whose cover is a solitary
    /// portrait — asking for one there does not produce a slightly busier picture,
    /// it produces an invented congregation standing in a scene that never had one.
    /// </summary>
    private readonly record struct SupportAngle(string Text, bool NeedsPeople);

    /// <summary>
    /// What each draft does differently. They all keep the cover's person, place,
    /// wardrobe and light; they differ only in where the camera stands and which
    /// moment it catches — which is the whole permitted range for a picture whose
    /// job is to belong to another one.
    ///
    /// Assigned rather than left open, for the reason the cover angles are: left
    /// open, every draft comes back as the same frontal mid-shot.
    ///
    /// ONLY ONE OF THEM NEEDS A CROWD, and the other three were reworded so they
    /// genuinely do not. "The moment after" used to end "others arriving into the
    /// frame", which quietly made two of the four angles crowd angles and would
    /// have defeated the gate below on half of every run.
    /// </summary>
    private static readonly SupportAngle[] SupportAngles =
    {
        new("WIDEN OUT. Stand the camera further back than the cover does and show the whole location " +
            "around them — the room, the landscape, the street, whatever the cover only hinted at past its " +
            "edges. The person is still clearly present and recognisable, but smaller in a much larger " +
            "frame, and the place itself is now the picture.", false),

        new("THE MOMENT AFTER. The same place a beat later, the moment released into movement: a turn, " +
            "arms opening, a step taken, fabric and hair still moving. Same light, same hour, same " +
            "wardrobe — a photograph from the next second of the same afternoon.", false),

        new("THE GATHERING. Fill the same location with people enjoying it together — a shared table, a " +
            "dance, a procession, a crowd mid-celebration — with the person from the cover among them and " +
            "part of it rather than posed in front of it.", true),

        new("COME IN CLOSER. Move in on one beautiful, specific detail of that same scene: hands, an " +
            "instrument, a shared cup, something being handed over, a face caught mid-laugh. Shallow depth " +
            "of field, the location still legible behind it, the person from the cover still in the frame.",
            false),
    };

    // ---- does this album's picture want other people in it? -----------------

    /// <summary>Whether other people belong in an album's supporting image.</summary>
    private enum Company
    {
        /// The cover already shows a crowd, congregation or gathering.
        Warranted,
        /// The cover is a solitary picture. No crowd is invented for it.
        Solitary,
        /// Nothing local says either way, so the model decides from the cover.
        Unknown,
    }

    /// <summary>
    /// The per-album register out of .models, keyed by album code, per voice.
    ///
    /// §8 of every model file is a table with one row per released cover and a
    /// short description of WHAT THE PICTURE SHOWS:
    ///
    ///   | 5 | JEIM1004EN | Every Tribe Sings | Guitar in a crowd of many nations | Nations |
    ///   | 13 | JEIM1012EN | Kingdom Roars    | Cheek against a white lion        | ...     |
    ///
    /// That column is a written description of the cover this tool is about to
    /// derive from, which makes it the cheapest honest answer to "does this album
    /// have people in it" — no extra turn, no vision call, no guess.
    ///
    /// Deliberately a SECOND parse of the same table AlreadyUsed reads. That one
    /// throws the code away and returns descriptions in a list, because it is
    /// building a "do not repeat these" blob; this one needs the code to look one
    /// album up. Sharing a parser would have meant one of the two carrying a
    /// shape it does not want.
    /// </summary>
    private readonly Dictionary<string, Dictionary<string, string>> _register =
        new(StringComparer.OrdinalIgnoreCase);

    private Dictionary<string, string> RegisterFor(string voice)
    {
        if (_register.TryGetValue(voice, out var hit)) return hit;
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
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
                    if (cells.Length < 6) continue;
                    var code = cells[2];
                    var what = cells[4];
                    if (code.Length < 4 || what.Length < 8) continue;
                    if (what.Contains("---", StringComparison.Ordinal)) continue;
                    if (code.Equals("Code", StringComparison.OrdinalIgnoreCase)) continue;
                    map[code] = what;
                }
            }
            catch { /* an unreadable register costs the gate, not the run */ }
        }
        _register[voice] = map;
        return map;
    }

    /// <summary>
    /// Words in a cover description that mean OTHER PEOPLE are in the picture.
    ///
    /// Deliberately narrow, and only words that cannot mean anything else. A
    /// place where people COULD be — a street, a market, a hall — is not evidence
    /// that anyone is in the frame, and treating it as evidence is how the crowd
    /// creeps back in everywhere. When this list is wrong it should be wrong
    /// toward Solitary, because that is the failure the Founder actually asked to
    /// be rid of: people invented for no reason.
    /// </summary>
    private static readonly string[] CompanyWords =
    {
        "crowd", "crowds", "congregation", "gathering", "people", "nations", "procession",
        "choir", "dancers", "dancing with", "multitude", "throng", "worshippers", "audience",
        "guests", "children", "family", "elders", "saints", "assembly", "parade", "feast",
        "banquet", "wedding", "villagers", "onlookers", "mourners", "disciples",
    };

    /// <summary>
    /// Whether this album's supporting image should have other people in it.
    ///
    /// Read off what the album's OWN COVER is recorded as showing, not off the
    /// album's mood, title or genre. The picture being derived from is the only
    /// thing that can answer this: a jubilant album whose cover is one woman and a
    /// white lion does not become a crowd scene because the songs are joyful.
    /// </summary>
    private Company CompanyFor(Piece job)
    {
        var shows = RegisterFor(VoiceOf(job)).GetValueOrDefault(job.Slug, "");
        if (shows.Length == 0) return Company.Unknown;
        return CompanyWords.Any(w => shows.Contains(w, StringComparison.OrdinalIgnoreCase))
            ? Company.Warranted
            : Company.Solitary;
    }

    /// <summary>
    /// The angles a given album may actually be shot from.
    ///
    /// A solitary album loses the gathering angle rather than being handed it with
    /// a "but do not add people" caveat afterwards. Contradicting an instruction
    /// is weaker than never issuing it, and the rotation still works because it is
    /// a modulo over whatever is left.
    /// </summary>
    private static SupportAngle[] AnglesFor(Company company) =>
        company == Company.Warranted
            ? SupportAngles
            : SupportAngles.Where(a => !a.NeedsPeople).ToArray();

    /// <summary>
    /// The place lock, sent immediately after the angle.
    ///
    /// WRITTEN AGAINST A MEASURED FAILURE, not as a precaution. JEIM1005EN
    /// "Roots By the River" — whose cover is one woman seated on a riverbank —
    /// came back as a stone amphitheatre in a wheat field packed with people. The
    /// instruction to keep the location already existed; it was one clause among
    /// many inside SupportAuthorClause, and it lost.
    ///
    /// It lost to the ANGLE. "Widen out and show the whole location" is an
    /// invitation to invent whatever lies past the frame, and a generator asked to
    /// invent surroundings will happily invent different surroundings. So the lock
    /// is placed directly after the angle rather than before it: the last word on
    /// the location belongs to the constraint, not to the instruction that
    /// stretches it.
    ///
    /// ONE LINE. See AspectSuffix.
    /// </summary>
    private const string PlaceLock =
        " THE PLACE IS NOT NEGOTIABLE. Whatever the angle above asks for, this photograph is taken in the " +
        "SAME PHYSICAL LOCATION as the attached cover — the same room, the same landscape, the same " +
        "building, the same ground, the same weather and the same time of day. Widening the frame means " +
        "showing MORE OF THAT PLACE, never moving to a different one. Do not relocate the scene, do not " +
        "swap the setting for a grander or more crowded one, and do not add architecture, staging or " +
        "landscape features the cover does not have. If the cover is a riverbank, this is that riverbank. " +
        "If the cover is a small room, this is that room.";

    /// <summary>
    /// Said when the cover is a solitary picture. A plain prohibition, because
    /// "prefer fewer people" is not an instruction a generator can act on.
    ///
    /// ONE LINE. See AspectSuffix.
    /// </summary>
    private const string NoCompanyClause =
        " WHO IS IN THE FRAME: this album's cover is not a crowd picture, and neither is this one. " +
        "Do NOT add a congregation, an audience, a choir, a queue or bystanders to fill the space. " +
        "Keep the same population the cover has — her, and whoever the cover genuinely shows — and let " +
        "the place, the light and the moment carry the picture instead.";

    /// <summary>
    /// Said when nothing local knows. The model can see the attached cover, which
    /// is more than this app can, so the decision is handed to it — with the
    /// DEFAULT SET TO NO. An open question about whether to add a crowd is
    /// answered "yes" by a generator almost every time.
    ///
    /// ONE LINE. See AspectSuffix.
    /// </summary>
    private const string JudgeCompanyClause =
        " WHO IS IN THE FRAME — DECIDE THIS FIRST, FROM THE ATTACHED COVER. Look at the cover and count " +
        "the people in it. If it already shows a crowd, a congregation or a gathering, this picture may " +
        "show one too. If it shows her alone, or with only one or two others, then this picture keeps that: " +
        "do NOT invent a congregation, an audience or bystanders to fill the frame. When it is not obvious, " +
        "choose the smaller number of people, not the larger.";

    /// <summary>
    /// What the OTHER PEOPLE in the frame wear, per persona.
    ///
    /// Keyed by persona slug — the first word of the voice folder, so
    /// "jubilee-inspire" is "jubilee". A voice with no entry gets no clause and
    /// the scene dresses itself from the attached cover, which is the right
    /// default: the cover already shows the world this album lives in.
    ///
    /// ADDING A PERSONA IS ONE ENTRY. Nothing else reads this table, and nothing
    /// downstream has to be told a new voice exists.
    ///
    /// 🔴 EVERY ENTRY MUST PROTECT THE PERSONA'S OWN SIGNATURE WARDROBE. A
    /// clause about "everyone in the frame" is read by the generator as including
    /// the person it is looking at in the attached cover, and that is exactly how
    /// a signature look gets quietly dismantled. Say who is excepted, and say it
    /// as a rule about the person rather than as an adjective on a garment —
    /// InspireManna's WHITE_ONLY carries the same warning for the same reason.
    /// </summary>
    private static readonly Dictionary<string, string> CompanyWardrobe =
        new(StringComparer.OrdinalIgnoreCase)
    {
        // JUBILEE. Founder direction, 2026-08-17: the people around her wear
        // bright, glamorous colour — purple, maroon red, blue, green and gold —
        // mashed together freely.
        //
        // SCOPE: SUPPORTING IMAGES ONLY. Her model file's §3.4 says the opposite
        // for COVERS — "radiant white as the whole world … the crowd's clothing"
        // — and that is untouched, because BuildCoverPrompt reads .models and
        // never comes through here. The two surfaces now differ on purpose: a
        // white-on-white cover, and beneath it a band where she is the still
        // white centre of a room full of jewel colour.
        //
        // Her own white is restated at the end, absolutely. It is the one thing
        // in her look that has never varied, and a "everyone is in bright
        // colour" instruction would have taken it first.
        ["jubilee"] =
            " THE PEOPLE AROUND HER — WARDROBE. Everyone else in the frame is dressed in bright, richly " +
            "saturated colour: deep purple and violet, red and maroon, blue, green, and yellow and gold. " +
            "Mix them freely, both across the crowd and WITHIN single garments — a gown banded in gold and " +
            "maroon, a wrap shot through with purple and green, embroidery or trim in a fifth colour again. " +
            "Glamorous, beautiful, celebratory formal dress: flowing fabrics with real sheen and drape, silk, " +
            "satin, brocade and shot fabric that catches the light, jewelled and metallic embroidery, " +
            "headwraps, sashes and shawls. Every person a different combination, so the crowd reads as a " +
            "mass of colour rather than a uniform. Nothing muted, dusty, pastel, beige, grey or drab anywhere " +
            "in the frame. Dress everyone modestly and elegantly: high closed necklines, sleeves to at least " +
            "the elbow, hems below the knee, nothing tight, sheer, cropped or low cut — the glamour is in the " +
            "colour, the fabric and the craftsmanship, never in how little is worn. " +
            "JUBILEE HERSELF IS THE ONE EXCEPTION AND IT IS ABSOLUTE: she stays in WHITE from head to foot, " +
            "every garment including her shoes, exactly as the attached cover shows her, with the turquoise " +
            "stone at her throat as her only colour. She never wears any other colour. The colour belongs to " +
            "the people around her, and she is the still white centre of it.",
    };

    /// <summary>
    /// The support counterpart to AuthorClause and CoverAuthorClause, and it
    /// inverts BOTH of them.
    ///
    /// An article clause throws the reference's costume away. A cover clause keeps
    /// the costume and throws the SETTING away, because a new cover must not repeat
    /// an old one's location. This clause keeps EVERYTHING — person, wardrobe,
    /// place, palette, light — and changes only the framing and the moment, because
    /// a supporting image that invents a new setting has stopped supporting its
    /// album and become a second, contradictory cover.
    ///
    /// ONE LINE. See AspectSuffix for why a newline here truncates the prompt.
    /// </summary>
    private static string SupportAuthorClause(string firstName) =>
        " The attached image is THIS ALBUM'S OWN COVER ART, and " + firstName + " is the person in it. " +
        "It is the reference for everything: KEEP the face and likeness, the hair, the wardrobe and its " +
        "cut, any coloured stone or marker worn at the throat, the location and its architecture, the " +
        "props, the colour palette, the hour of the day and the quality of the light. Someone seeing the " +
        "cover and this picture side by side must recognise them instantly as the same person, in the same " +
        "place, photographed the same afternoon. " +
        "CHANGE only the camera position, the framing and the moment. This is NOT a copy of the cover, NOT " +
        "a crop of it and NOT a mirrored version of it — it is a different photograph of the same scene. " +
        "Ignore any lettering, title text, wordmark, signature or border visible in the attached cover: " +
        "those were added afterwards and must not appear in what you produce.";

    /// <summary>
    /// Every member of the Inspire Family is six feet tall, stated on the same
    /// terms AgeClause states the age: as a FACT ABOUT THE PERSON that overrides
    /// whatever the attached cover happens to show.
    ///
    /// WHY IT IS NOT JUST THE WORDS "SIX FEET TALL". A camera cannot photograph a
    /// measurement. Height exists in a picture only as SCALE — against the people
    /// nearby, against a doorway, a railing, a table, an instrument. A prompt that
    /// states the number and stops has said something unphotographable, and the
    /// generator renders an average person of unspecified height. So the number is
    /// given once and then translated into the comparisons that actually carry it.
    ///
    /// AND IT HAS TO WORK WITH NOBODY ELSE IN THE FRAME. Four of five supporting
    /// images are solitary by the time the crowd gate has run (see CompanyFor), so
    /// a clause that only compared the persona to other people would do nothing on
    /// most of the catalogue. The architecture and the props are the anchor there.
    ///
    /// THE BUILD USED TO RIDE ALONG HERE, and no longer needs to: BuildClause now
    /// states it on every path, so this clause points at it rather than carrying a
    /// second wording of it. The coupling still matters — "six feet tall" drifts
    /// toward heavy set and broad shouldered without a counterweight — which is
    /// why the two clauses are appended adjacent and read as one description.
    ///
    /// The negation that used to live here ("never heavy set, stocky or broad") is
    /// gone deliberately. See BuildClause: naming the heavy reading in order to
    /// forbid it plants it, measured in InspireManna's persona-image.js. Every
    /// word in both clauses is now one we want in the picture.
    ///
    /// ONE LINE. See AspectSuffix.
    /// </summary>
    private static string HeightClause(string firstName) =>
        " HEIGHT — " + firstName + " is SIX FEET TALL (183 cm), and so is every member of the Inspire " +
        "Family who appears in this image. Make that visible through SCALE, since height cannot be seen " +
        "on its own: " + firstName + " stands noticeably taller than most of the people nearby, with an " +
        "eyeline high in any group, and reads correctly against doorways, arches, railings, tables, " +
        "chairs, instruments and every other object of known size in the frame. With nobody else present, " +
        "carry it in the architecture and the furnishings instead — a long figure against the room. " +
        "Tall and slender together, exactly as the BUILD clause states — statuesque, graceful and easy in " +
        "the body, long in the line. Everyone else in the frame is an ordinary adult height. " +
        "This OVERRIDES the attached cover: if it shows a shorter or an average-height figure, the height " +
        "in THIS image is the one stated here.";

    /// <summary>
    /// The ratio and the no-text law, sent last because the last instruction is the
    /// one the web UI honours most reliably.
    ///
    /// ONE LINE, deliberately — see AspectSuffix. A newline here splits the
    /// ProseMirror composer into paragraphs and only the last one survives.
    /// </summary>
    private const string SupportSuffix =
        " IMPORTANT: produce this image in a 16:9 widescreen landscape aspect ratio, " +
        "wide horizontal orientation, not square and not portrait. " +
        "CRITICAL: the image must contain NO text of any kind — no title, no lettering, no words, " +
        "no signature, no watermark, no logo, no caption and no border. It is a photograph only." +
        " GENERATE THE IMAGE NOW. Do not reply with text, do not ask what to do with the attachment, do not offer options or ask which one is wanted, and do not describe what you could make. The attachment is a reference, not a question. Return the finished picture.";

    // ---- the prompt ---------------------------------------------------------

    /// <summary>
    /// One album's supporting-image prompt.
    ///
    /// Shorter than a cover's, on purpose. The cover is attached, and it carries
    /// the person, the wardrobe, the location, the palette and the light far
    /// better than any sentence describing them could. What is left for the text
    /// to do is name the album, say which moment to catch, and fix the emotional
    /// register and the grade.
    /// </summary>
    private string BuildSupportPrompt(Piece job)
    {
        LoadAlbumFacts();

        var title = TitleOf(job);
        var sb = new StringBuilder();

        sb.Append("Create a wide 16:9 companion photograph for a music album. ")
          .Append("The attached image is that album's own cover art, and it is the reference for the ")
          .Append("person, the place, the wardrobe, the palette and the light. ")
          .Append("This picture is NOT another cover: it is a second photograph from the same scene, ")
          .Append("used as the wide banner above the album's song list.");

        sb.Append(" THIS ALBUM: the title is \"").Append(title).Append("\".");
        if (_themes.TryGetValue(job.Slug, out var theme) && theme.Length > 0)
            sb.Append(" What it is about: ").Append(theme).Append('.');
        if (_genres.TryGetValue(job.Slug, out var genre) && genre.Length > 0)
            sb.Append(" Its musical style is ").Append(genre).Append('.');

        var songs = SongTitlesFor(job);
        if (songs.Count > 0)
        {
            sb.Append(" Its songs are: ").Append(string.Join("; ", songs)).Append('.');
            sb.Append(" Let the moment you catch belong to those songs rather than to music in general.");
        }

        // WHO IS IN THE FRAME, decided before anything is asked for. Everything
        // below reads off this: which angles are available, whether the wardrobe
        // rule is issued at all, and which joy register is used.
        var company = CompanyFor(job);
        var angles = AnglesFor(company);
        sb.Append(" APPROACH FOR THIS DRAFT — ").Append(angles[job.Variant % angles.Length].Text);

        // Straight after the angle, because the angle is what breaks it.
        sb.Append(PlaceLock);

        // The gate itself. Warranted needs no clause — the angle and the wardrobe
        // rule already say a crowd is wanted, and a third instruction saying the
        // same thing only crowds the prompt.
        if (company == Company.Solitary) sb.Append(NoCompanyClause);
        else if (company == Company.Unknown) sb.Append(JudgeCompanyClause);

        // What the rest of the frame wears — ONLY when there is a rest of the
        // frame. Issuing "everyone around her wears bright colour" for a picture
        // that is supposed to have nobody else in it is itself an instruction to
        // put people there, and it would win: it is concrete, visual and long,
        // where the prohibition above is one sentence.
        if (company != Company.Solitary
            && CompanyWardrobe.TryGetValue(job.AuthorSlug, out var wardrobe) && wardrobe.Length > 0)
        {
            sb.Append(company == Company.Unknown ? " IF AND ONLY IF you decided above that this picture " +
                      "carries other people, the following governs what they wear." : "");
            sb.Append(wardrobe);
        }

        // The register and the grade come last of the descriptive clauses, so they
        // govern whatever the angle produced.
        sb.Append(' ').Append(company == Company.Solitary ? JoyLookSolo : JoyLook);
        sb.Append(' ').Append(GoldenLook);

        return sb.ToString();
    }

    /// <summary>
    /// Fill in the prompt just before the job is sent, for the reason PrepareCover
    /// does: it costs a lyrics-file read, worth paying for the album about to be
    /// generated and not for the eight hundred that are not.
    /// </summary>
    private bool PrepareSupport(Piece job)
    {
        if (job.Prompt.Length > 0) return true;
        if (job.CoverFile.Length == 0 || !File.Exists(job.CoverFile))
        {
            Log("  ✗ This album's cover is not on disk any more, so there is nothing to derive from.");
            return false;
        }
        job.Prompt = BuildSupportPrompt(job);
        if (job.Prompt.Length == 0) return false;

        var company = CompanyFor(job);
        var angles = AnglesFor(company);
        var angle = angles[job.Variant % angles.Length].Text.Split('.')[0];
        Log($"  Draft {job.Variant + 1} — {angle}.");

        var shows = RegisterFor(VoiceOf(job)).GetValueOrDefault(job.Slug, "");
        Log(company switch
        {
            Company.Warranted => $"  People: YES — the cover is recorded as \"{shows}\".",
            Company.Solitary  => $"  People: NO — the cover is recorded as \"{shows}\", so none are added.",
            _ => "  People: not recorded in .models — the turn decides from the cover, defaulting to none.",
        });
        if (company != Company.Solitary && CompanyWardrobe.ContainsKey(job.AuthorSlug))
            Log($"  Wardrobe rule for {job.Author}: anyone around her in colour, she stays in white.");
        Log($"  Reference: {Path.GetFileName(job.CoverFile)} (this album's own cover).");
        Log($"  Prompt: {(job.Prompt.Length > 260 ? job.Prompt[..260] + "…" : job.Prompt)}");
        return true;
    }

    /// <summary>
    /// Attach the album's OWN cover. One image, not three.
    ///
    /// The Covers view attaches three of the persona's released covers because it
    /// is teaching a RANGE — a look to sit inside. This is the opposite job: there
    /// is exactly one right answer for the person, the place and the light, and it
    /// is the cover of this album. A second reference could only pull away from it.
    ///
    /// CoverRefBase64 is reused rather than reading the file whole, and its 80%
    /// centre crop earns its place here: it removes the border, most of the
    /// wordmark up the left edge and most of the title along the bottom, so the
    /// model sees the photograph and not the lettering it must not reproduce.
    /// </summary>
    private async Task<bool> AttachSupportReference(Piece job, CancellationToken ct)
    {
        if (job.CoverFile.Length == 0 || !File.Exists(job.CoverFile))
        {
            Log("  ✗ No cover on disk to attach — nothing was sent.");
            return false;
        }
        var b64 = CoverRefBase64(job.CoverFile);
        if (b64 == null) return false;
        if (!await AttachReference(b64, Path.GetFileName(job.CoverFile), ct)) return false;
        Log($"  Reference attached: {Path.GetFileName(job.CoverFile)}.");
        return true;
    }

    // ---- the run ------------------------------------------------------------

    /// <summary>Albums with a cover and no supporting image yet.</summary>
    private List<Piece> PendingSupport() =>
        _supports.Where(s => !s.HasImage && !_completedPaths.Contains(s.Path)).ToList();

    /// <summary>
    /// One album's Nth draft. A separate job with its own completion key, its own
    /// angle and its own file, so a partial run keeps the drafts it finished and
    /// re-queues only the ones it did not.
    /// </summary>
    private Piece SupportDraftOf(Piece album, int variant) => new()
    {
        Path = $"{album.AlbumDir}#support{variant}",
        AlbumDir = album.AlbumDir,
        TargetDir = album.TargetDir,
        CoverFile = album.CoverFile,
        SupportFile = SupportPathFor(album.TargetDir, album.Slug, variant + 1),
        Slug = album.Slug,
        Section = SupportSection,
        Kind = Kind.Support,
        Title = $"{album.Title}   [draft {variant + 1}]",
        Author = album.Author,
        AuthorSlug = album.AuthorSlug,
        Variant = variant,
        Prompt = "",
    };

    private async void BtnSupportGenerate_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;

        var pending = PendingSupport();
        if (pending.Count == 0)
        {
            Log(_supports.Count == 0
                ? "No album in this view has a cover to build a supporting image from."
                : "Every album in this view already has a supporting image.");
            return;
        }

        var drafts = SelectedSupportDraftCount();
        var queue = new List<Piece>();
        foreach (var a in pending)
            for (int d = 0; d < drafts; d++)
                queue.Add(SupportDraftOf(a, d));

        Log($"\n=== Support Images: {pending.Count} album(s) × {drafts} draft(s) = {queue.Count} image(s) ===");
        Log("  Each one is derived from its own album's cover, which is attached to the turn.");
        Log("  16:9 landscape, WebP, warm golden light — the InspireManna house grade.");
        Log(@"  Output: <album>\artwork\<CODE>-support-<N>.webp ON THE MUSIC DRIVE.");
        Log("  There is no review folder for these: the lowest-numbered draft is what the site shows,");
        Log("  so deleting the ones you do not want is how you choose.");

        await RunBatch(queue, RunView.Support);
    }
}
