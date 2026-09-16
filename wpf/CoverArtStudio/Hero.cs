using System.IO;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;

namespace JubileeCoverArtStudio;

// ============================================================================
//  HERO IMAGES  —  the square cover, reverse-engineered into 16:9
// ============================================================================
//
// An album cover is 1:1 and carries the house chrome: the inset border, the
// persona's name in script up the left edge, the title along the bottom. That is
// the signature, and it is exactly what makes a cover unusable as a page banner.
// A website hero needs the OPPOSITE: wide, quiet, no lettering, room for a
// headline to sit on top of it.
//
// So this view takes the cover that already exists and asks for the same
// photograph WIDENED — the same person, the same wardrobe, the same location,
// the same light, the same hour — reframed as a cinematic 16:9 still with the
// chrome gone. It is a reverse-engineering job, not a new picture: the cover is
// the brief, and the album's own art is the only reference attached.
//
// WHY THIS IS NOT THE IMAGE STUDIO. The studio takes a typed prompt and no
// album. This takes an album and no typing: pick a persona, and every album that
// HAS a cover becomes a job whose reference is its own artwork. The two could
// not share a worklist because they do not share a unit of work.
//
// ---------------------------------------------------------------------------
//  🔴 WHERE THESE LAND, AND WHY IT IS NOT review/
// ---------------------------------------------------------------------------
//
// Covers go to review/ because a cover that wrote itself into artwork/ would be
// indistinguishable from an approved master and would mark the album covered.
// A hero has no such hazard: nothing reads this folder to decide whether an album
// is finished, and no publish step promotes it. It is a website asset, so it is
// written where the website serves static files from:
//
//     app/web/public/images/heroes/<persona-folder>/<CODE>.webp
//         -> https://<site>/images/heroes/melody-inspire/MDIM1043EN.webp
//
// By persona folder, because that is how the music drive is organised and how a
// person looking for "Melody's heroes" would look for them. By album CODE and not
// by title, because the code is what every other part of this system keys on and
// a retitled album must not orphan its picture. (AMIM1001EN published
// "BRIDGE ACROSS FAITHS" over an album renamed months earlier; a title-keyed
// filename is the same failure waiting to happen.)
//
// NOTHING IS EVER OVERWRITTEN. A second generation lands as `<CODE> (2).webp`.
// The site reads `<CODE>.webp`, so the newest draft never silently replaces the
// one already in use — moving a better draft into place is a decision, made by
// deleting the first.
//
// WebP, not PNG. These are web assets served to browsers, which is the one place
// in this repo where WebP is the right archive format rather than a lossy step
// away from one; app/web/public/images/backstage is already WebP throughout.

public partial class MainWindow
{
    /// <summary>Albums with a cover to reverse-engineer, for the current filter.</summary>
    private readonly List<Job> _heroes = new();

    /// <summary>
    /// Where hero images land: inside the website's own static folder, so a
    /// generated hero is servable the moment it is written and no publish step
    /// stands between making one and using it.
    /// </summary>
    private string HeroRoot => _heroRoot.Length > 0
        ? _heroRoot
        : (_root.Length > 0 ? Path.Combine(_root, "app", "web", "public", "images", "heroes") : "");

    private string HeroDirFor(string voice) => Path.Combine(HeroRoot, voice);

    /// <summary>The hero file for an album code, or "" when there is none.</summary>
    private string ExistingHero(string voice, string code)
    {
        var dir = HeroDirFor(voice);
        if (!Directory.Exists(dir)) return "";
        foreach (var ext in new[] { ".webp", ".png", ".jpg", ".jpeg" })
        {
            var f = Path.Combine(dir, code + ext);
            if (File.Exists(f)) return f;
        }
        return "";
    }

    // ========================================================================
    //  MARKING A HERO FOR REGENERATION
    // ========================================================================
    //
    // A hero that has to be redone is MOVED, not deleted and not overwritten, to
    //
    //     review\_heroes-rejected\<persona-folder>\<CODE>.webp
    //
    // and that move IS the mark. It does three things at once, which is why it is
    // a move rather than a flag in a config file:
    //
    //   1. the site stops serving the bad picture — nothing under review\ is public;
    //   2. the album has no hero again, so it is back in the queue, and the next
    //      generation lands as <CODE>.webp, the name the site reads, rather than
    //      as a (2) beside the picture that was rejected;
    //   3. the rejected picture is kept, next to the reason it was pulled, and
    //      moving it back undoes the whole thing.
    //
    // Same convention as review\_rejected-2026-08-11 for covers. The mark clears
    // itself: once a new hero exists the album simply has a hero again.

    private string HeroRejectRoot => _root.Length > 0 ? Path.Combine(ReviewRoot, "_heroes-rejected") : "";

    /// <summary>The newest rejected hero for an album code, or "" when there is none.</summary>
    private string RejectedHero(string voice, string code)
    {
        if (HeroRejectRoot.Length == 0) return "";
        var dir = Path.Combine(HeroRejectRoot, voice);
        if (!Directory.Exists(dir)) return "";
        // <CODE>.webp, or <CODE> (2).webp when an album has been pulled twice.
        return Directory.EnumerateFiles(dir, code + "*")
            .Where(f =>
            {
                var n = Path.GetFileNameWithoutExtension(f);
                return n.Equals(code, StringComparison.OrdinalIgnoreCase)
                    || n.StartsWith(code + " (", StringComparison.OrdinalIgnoreCase);
            })
            .OrderByDescending(File.GetLastWriteTimeUtc)
            .FirstOrDefault() ?? "";
    }

    private void BtnHeroMarkRedo_Click(object sender, RoutedEventArgs e)
    {
        if (_running) { Log("A run is in progress — press Stop before marking heroes."); return; }
        var job = SelectedHero();
        if (job == null) { Log("Select an album first."); return; }
        if (!job.HasHero || !File.Exists(job.HeroFile))
        {
            Log(job.MarkedForRedo
                ? $"{job.Title} is already marked for regeneration."
                : $"{job.Title} has no hero to pull — it is already in the queue.");
            return;
        }
        if (HeroRejectRoot.Length == 0) { Log("No repo root — cannot work out where rejected heroes go."); return; }

        var voice = VoiceFolderOf(job);
        var dest = UniquePath(Path.Combine(HeroRejectRoot, voice, Path.GetFileName(job.HeroFile)));
        var ok = MessageBox.Show(this,
            $"Pull the hero for {job.Title} off the site and queue it for regeneration?\n\n" +
            $"It is moved, not deleted, to:\n{dest}",
            "Mark for regeneration", MessageBoxButton.OKCancel, MessageBoxImage.Question);
        if (ok != MessageBoxResult.OK) return;

        try
        {
            Directory.CreateDirectory(Path.GetDirectoryName(dest)!);
            File.Move(job.HeroFile, dest);
            Log($"↻ {job.Title} — marked for regeneration. The old hero is kept at {dest}");
        }
        catch (Exception ex) { Log($"Could not move {job.HeroFile}: {ex.Message}"); return; }
        ScanHeroes();
    }

    // ========================================================================
    //  THE PICKER AND THE FILTERS
    // ========================================================================

    /// <summary>
    /// False until the constructor has finished — same reason as _coverUiBuilt.
    /// Filling the picker sets SelectedIndex and fires the handler while the window
    /// is still being built, and scanning the drive from there would delay every
    /// launch including the ones that never open this view.
    /// </summary>
    private bool _heroUiBuilt;

    private void FillHeroPersonaPicker()
    {
        if (CmbHeroPersona == null) return;
        CmbHeroPersona.Items.Clear();
        CmbHeroPersona.Items.Add(new ComboBoxItem { Content = "All personas", Tag = "" });

        if (Directory.Exists(EffectiveMusicRoot))
        {
            foreach (var dir in Directory.EnumerateDirectories(EffectiveMusicRoot)
                         .Select(Path.GetFileName)
                         .Where(n => n is { Length: > 0 } && !n.StartsWith('_') && !n.StartsWith('.'))
                         .Where(VoiceAllowed)
                         .OrderBy(n => n, StringComparer.OrdinalIgnoreCase))
            {
                CmbHeroPersona.Items.Add(new ComboBoxItem { Content = VoiceDisplay(dir!), Tag = dir });
            }
        }
        CmbHeroPersona.SelectedIndex = 0;
    }

    private string SelectedHeroVoice() => (CmbHeroPersona?.SelectedItem as ComboBoxItem)?.Tag as string ?? "";

    private void CmbHeroPersona_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (!_heroUiBuilt) return;
        ScanHeroes();
    }

    private void BtnHeroesRefresh_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        ScanHeroes();
    }

    private void ChkHeroesShowAll_Click(object sender, RoutedEventArgs e) => RenderHeroes();

    private void ChkHeroesEnglishOnly_Click(object sender, RoutedEventArgs e)
    {
        if (!_heroUiBuilt) return;
        ScanHeroes();
    }

    private void BtnHeroFolderOpen_Click(object sender, RoutedEventArgs e)
    {
        var job = SelectedHero();
        var dir = job != null ? HeroDirFor(VoiceFolderOf(job)) : HeroRoot;
        if (!Directory.Exists(dir)) dir = HeroRoot;
        if (dir.Length == 0 || !Directory.Exists(dir)) { Log($"Nothing there yet: {dir}"); return; }
        try { System.Diagnostics.Process.Start(new System.Diagnostics.ProcessStartInfo(dir) { UseShellExecute = true }); }
        catch (Exception ex) { Log("Could not open the folder: " + ex.Message); }
    }

    // ========================================================================
    //  THE SCAN
    // ========================================================================
    //
    // The worklist is every album that HAS a cover, because the cover IS the
    // brief. An album with no artwork has nothing to reverse-engineer, so it is
    // not listed here at all — it belongs in the Album Covers view first.

    private void ScanHeroes()
    {
        _heroes.Clear();
        if (_root.Length == 0 || !Directory.Exists(EffectiveMusicRoot))
        {
            Log($"Music root not found: {EffectiveMusicRoot}");
            Log("  Set it in Settings. 🔴 J:\\jubileepraise.com\\ was created empty by the rename —");
            Log("  the catalogue is still under J:\\jubilujah.com\\music. See CLAUDE.md.");
            RenderHeroes();
            return;
        }

        var only = SelectedHeroVoice();
        var voices = Directory.EnumerateDirectories(EffectiveMusicRoot)
            .Select(Path.GetFileName)
            .Where(n => n is { Length: > 0 } && !n.StartsWith('_') && !n.StartsWith('.'))
            .Where(VoiceAllowed)
            .Where(n => only.Length == 0 || string.Equals(n, only, StringComparison.OrdinalIgnoreCase))
            .OrderBy(n => n, StringComparer.OrdinalIgnoreCase)
            .ToList();

        var englishOnly = ChkHeroesEnglishOnly?.IsChecked != false;

        int ready = 0, have = 0, noCover = 0, skippedLang = 0, marked = 0;
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
                // No cover, no brief. Reverse-engineering needs something to
                // reverse-engineer, and inventing one here would just be the
                // Album Covers view with a wider aspect ratio.
                if (cover.Length == 0) { noCover++; continue; }

                var title = AlbumTitleOf(dir, folder);
                var hero = ExistingHero(voice!, code);
                var rejected = RejectedHero(voice!, code);
                if (hero.Length > 0) have++; else ready++;
                if (hero.Length == 0 && rejected.Length > 0) marked++;

                _heroes.Add(new Job
                {
                    Path = dir,
                    Kind = Kind.Hero,
                    AlbumDir = dir,
                    ArtworkDir = artDir,
                    Code = code,
                    Title = $"{code} · {title}",
                    Artist = VoiceDisplay(voice!),
                    // The album's own cover — both the reference that will be
                    // attached and the picture the preview pane shows.
                    ImageFile = cover,
                    OutFile = Path.Combine(HeroDirFor(voice!), code + ".webp"),
                    HeroFile = hero,
                    RejectedHero = rejected,
                    Webp = true,
                    Prompt = "",
                });
            }
        }

        Log($"Heroes: {_heroes.Count} {(englishOnly ? "English " : "")}album(s) with cover art under "
            + $"{(only.Length == 0 ? "all personas" : VoiceDisplay(only))} — "
            + $"{ready} with no hero yet, {have} already done."
            + (marked > 0 ? $"  ↻ {marked} of those marked for regeneration." : "")
            + (noCover > 0 ? $"  ({noCover} skipped — no cover to work from.)" : "")
            + (skippedLang > 0 ? $"  ({skippedLang} localised edition(s) hidden.)" : ""));
        if (HeroRoot.Length > 0) Log($"  → {HeroRoot}");

        RenderHeroes();
    }

    // ========================================================================
    //  THE WORKLIST
    // ========================================================================

    private void RenderHeroes()
    {
        if (LstHeroes == null) return;
        var showAll = ChkHeroesShowAll?.IsChecked == true;

        var rows = new List<Row>();
        foreach (var p in _heroes)
        {
            var fresh = _sessionDone.Contains(p.Path);
            if (p.HasHero && !showAll && !fresh) continue;

            var (mark, brush) =
                fresh ? ("✓", TickFresh)
                : p.HasHero ? ("✓", TickOld)
                : p.MarkedForRedo ? ("↻", WarnAmber)
                : ("", Brushes.Transparent);

            rows.Add(new Row
            {
                Mark = mark,
                MarkBrush = brush,
                Title = fresh ? p.Title + "   — new"
                      : p.MarkedForRedo ? p.Title + "   — marked for regeneration"
                      : p.Title,
                Job = p,
            });
        }

        if (rows.Count == 0)
        {
            var scope = ChkHeroesEnglishOnly?.IsChecked != false ? " English" : "";
            rows.Add(new Row
            {
                Title = _heroes.Count == 0
                    ? $"No{scope} albums with cover art under this persona."
                    : $"Every{scope} album here already has a hero image.",
                MarkBrush = RowPlain,
            });
        }

        LstHeroes.ItemsSource = rows;
    }

    private Job? SelectedHero() => (LstHeroes?.SelectedItem as Row)?.Job;

    private void LstHeroes_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        var job = SelectedHero();
        if (job == null) { ShowHeroPreviewFile("", ""); return; }
        // The HERO when there is one, because that is the thing being judged;
        // the cover otherwise, because that is what the hero will be made from.
        var file = job.HasHero ? job.HeroFile : Path.Combine(job.ArtworkDir, job.ImageFile);
        ShowHeroPreviewFile(file,
            job.HasHero ? job.Title + "  —  hero"
            : job.MarkedForRedo ? job.Title + "  —  cover (the reference) · rejected hero kept in review\\_heroes-rejected"
            : job.Title + "  —  cover (the reference)");
    }

    private void ShowHeroPreviewFile(string file, string caption)
    {
        if (HeroPreviewImage == null || HeroPreviewEmpty == null || HeroPreviewCaption == null) return;
        if (file.Length == 0 || !File.Exists(file))
        {
            HeroPreviewImage.Source = null;
            HeroPreviewEmpty.Visibility = Visibility.Visible;
            HeroPreviewCaption.Text = "";
            return;
        }
        try
        {
            var (img, w, h) = LoadPreview(file);
            HeroPreviewImage.Source = img;
            HeroPreviewEmpty.Visibility = Visibility.Collapsed;
            HeroPreviewCaption.Text = $"{caption}   ·   {w}×{h}";
        }
        catch (Exception ex)
        {
            HeroPreviewImage.Source = null;
            HeroPreviewEmpty.Visibility = Visibility.Visible;
            HeroPreviewCaption.Text = "Could not read that file: " + ex.Message;
        }
    }

    // ========================================================================
    //  THE PROMPT
    // ========================================================================
    //
    // Built, never stored — the same rule the covers view follows. The brief is
    // the attached cover itself, so the text's whole job is to say
    //
    //   (a) do not invent: this is the SAME photograph, widened;
    //   (b) drop the chrome, which is the one thing that must NOT survive;
    //   (c) 16:9, cinematic, with somewhere for a headline to sit.
    //
    // WHY "WIDEN", NOT "CROP". A 16:9 crop of a 1:1 cover throws away the top and
    // bottom of the composition and lands on the subject's chin. What a hero needs
    // is the frame OPENED — the scene continuing past the left and right edges of
    // the square, which is what the square was cut from in the first place.

    /// <summary>
    /// Cinematic framings, rotated per draft. The cover fixes the world; these
    /// decide where the camera stands in it.
    ///
    /// Deliberately fewer and calmer than the covers' four angles. A cover has to
    /// stop a scroll, so it is allowed to be dramatic; a hero sits UNDER a headline
    /// and above body text, and a dramatic one fights the page it is on.
    /// </summary>
    private static readonly string[] HeroFramings =
    {
        // "Smaller because the camera is further back", not just "smaller": asked
        // only to make the subject smaller while keeping the full height in shot,
        // the model shrank the body and kept the head — see ProportionClause.
        "THE ESTABLISHING WIDE. Pull the camera back and open the frame well past the edges of the square: " +
        "show the room, the landscape or the street the original was cut out of, with the subject smaller " +
        "in the frame only because the camera stands further away — still a full-size adult in true scale " +
        "with the setting — and placed off-centre. This is the widest, calmest reading — the one that works " +
        "under a headline.",

        "THE CINEMATIC TWO-THIRDS. Keep the subject roughly where the cover had them but let the world run " +
        "out to both sides — a long horizontal frame with real depth, foreground falling away and background " +
        "receding, the way a film still holds an anamorphic frame.",

        "THE MOMENT EITHER SIDE. The same scene, the same light, one beat before or after the cover's instant — " +
        "the subject turning, walking on, looking away — so the hero reads as a companion frame from the same " +
        "shoot rather than a stretched copy of the cover.",
    };

    /// <summary>
    /// Which side of the frame is kept quiet for a headline, alternating per draft
    /// so a persona's heroes do not all reserve the same corner.
    /// </summary>
    private static readonly string[] HeroTextSafe =
    {
        "Leave the LEFT third of the frame visually calm — sky, wall, water, shadow or open ground — " +
        "so a headline can be laid over it later without covering anything that matters.",
        "Leave the RIGHT third of the frame visually calm — sky, wall, water, shadow or open ground — " +
        "so a headline can be laid over it later without covering anything that matters.",
    };

    /// <summary>
    /// The clause that does the actual work, and the reason this view exists.
    ///
    /// 🔴 THE CHROME MUST NOT SURVIVE. The attached cover has a white inset border,
    /// the persona's name in script up the left edge and the album title along the
    /// bottom, and a model handed that picture will faithfully reproduce all three
    /// because they are part of what it was shown. Saying "no text" once is not
    /// enough when the reference is covered in text; it is said here, again in the
    /// suffix, and the reference is centre-cropped before it is sent.
    /// </summary>
    private const string HeroChromeClause =
        "CRITICAL — WHAT MUST NOT COME ACROSS: the reference is a finished album sleeve and carries a white " +
        "inset border, a handwritten artist name up its left edge, and the album title in capitals along the " +
        "bottom. NONE of that is part of the photograph and none of it may appear in your image. No border, " +
        "no frame, no inset line, no lettering, no title, no artist name, no signature, no watermark, no logo, " +
        "no caption, no letters or numbers anywhere. Reproduce the PHOTOGRAPH underneath the sleeve design and " +
        "nothing of the sleeve design itself. ";

    private string BuildHeroPrompt(Job job, int draft)
    {
        var framing = HeroFramings[draft % HeroFramings.Length];
        var textSafe = HeroTextSafe[draft % HeroTextSafe.Length];
        var title = job.Title.Contains('·') ? job.Title.Split('·', 2)[1].Trim() : job.Title;

        var theme = _themes.TryGetValue(job.Code, out var th) && th.Length > 0 ? th : "";
        var genre = _genres.TryGetValue(job.Code, out var gn) && gn.Length > 0 ? gn : "";

        var sb = new System.Text.StringBuilder();
        sb.Append("The attached image is the album cover for \"").Append(title).Append("\" by ")
          .Append(job.Artist).Append(". ");
        sb.Append("Recreate the photograph in it as a WIDESCREEN CINEMATIC STILL. ");

        // The identity lock. Everything the cover establishes is fixed; only the
        // frame changes. Without this the model treats the reference as a mood
        // board and returns a different person in a different place.
        sb.Append("KEEP EVERYTHING THE SAME as the attached photograph: the same person with the same face and " +
                  "likeness, the same hair, the same wardrobe and its exact colours and patterns, the same " +
                  "location, the same props, the same time of day, the same weather, the same colour palette " +
                  "and the same quality of light. It must read as another frame from the same shoot, taken " +
                  "seconds apart with a wider lens — not as a new picture inspired by it. " +
                  "The exceptions, which govern over the attached photograph: the WARDROBE instructions below " +
                  "decide the clothing and the occasion, and the BUILD and PROPORTIONS instructions below decide " +
                  "the figure. Where the attached photograph differs from them, change it to match them. ");

        sb.Append("WIDEN THE FRAME rather than cropping it: extend the scene outward to the left and right, " +
                  "inventing only what plausibly continues beyond the square's edges, and keep the full height " +
                  "of the original subject in shot. ").Append(framing).Append(' ');

        if (theme.Length > 0) sb.Append("The album's theme: ").Append(theme).Append(". ");
        if (genre.Length > 0) sb.Append("Its musical register: ").Append(genre).Append(". ");

        sb.Append(textSafe).Append(' ');
        // The figure. Heroes carried neither of these until 2026-09-11, so a hero
        // copied whatever body its cover had and then distorted it to fill 16:9 —
        // the proportion complaints came from heroes, not covers.
        sb.Append(BuildClause(FirstNameOf(job))).Append(' ');
        sb.Append(ProportionClause(FirstNameOf(job))).Append(' ');
        // 🔴 The reverse-engineering case is the WORST case for this, which is why
        // it is here and not only on covers. A hero is built by handing the model
        // the album cover and saying "keep the wardrobe identical" — so a cover
        // that already reads as bridal would be faithfully widened into a bridal
        // BANNER, and a banner is the thing that ends up across the top of a page.
        // The clause carries its own override for exactly that case.
        sb.Append(NoBridalClause(FirstNameOf(job))).Append(' ');
        // And the same reasoning, harder: a cover showing trousers is widened into
        // a banner showing trousers unless the prompt says to change them.
        sb.Append(ModestWardrobeClause(FirstNameOf(job))).Append(' ');
        sb.Append(HeroChromeClause);
        sb.Append("Photographic and cinematic: a real photograph made with a wide cinema lens, natural depth of " +
                  "field, filmic colour, no illustration, no painterly rendering, no collage, no 3D render. ");
        sb.Append(SelfCheckClause(FirstNameOf(job)));

        // Flattened: a newline anywhere truncates the prompt in the composer,
        // which keeps only the final paragraph. Same rule as the covers view.
        return System.Text.RegularExpressions.Regex.Replace(sb.ToString(), @"\s{2,}", " ").Trim();
    }

    /// <summary>
    /// The suffix, appended last and on one line — the aspect ratio plus one more
    /// pass at the lettering, because the last clause is the one the web UI honours
    /// most reliably and lettering is the failure that matters here.
    /// </summary>
    internal const string HeroSuffix =
        " IMPORTANT: produce this image in a 16:9 widescreen landscape aspect ratio, exactly — much wider than " +
        "it is tall, not square and not portrait. " +
        "The image must contain NO text of any kind and NO border or frame of any kind — no title, no artist " +
        "name, no lettering, no words, no signature, no watermark, no logo and no caption. It is a photograph " +
        "only, edge to edge. " +
        // Phrased POSITIVELY even here, where a blunt "not a wedding" would be
        // shorter. The last clause of the turn is the most strongly honoured one,
        // which makes it the worst possible place to name the reading being
        // avoided — see NoBridalClause for why naming it plants it.
        // SuffixFor adds the per-persona wardrobe reminder after this, and then
        // GenerateNowClause.
        "The clothing is ordinary contemporary wear and the occasion is an ordinary one. ";

    /// <summary>
    /// The one reference a hero job carries: the album's own cover, registered for
    /// centre-cropping so the wordmark up the left edge and the title along the
    /// bottom are mostly gone before it is ever sent. Asking for no lettering while
    /// showing lettering is a fight worth avoiding — the prompt still says so twice
    /// in case a corner survives the crop.
    /// </summary>
    private List<string> HeroReferencesFor(Job job)
    {
        var file = Path.Combine(job.ArtworkDir, job.ImageFile);
        if (!File.Exists(file)) return new List<string>();
        _croppedRefs.Add(file);
        return new List<string> { file };
    }

    /// <summary>Fill in the prompt just before the job is sent.</summary>
    private bool PrepareHero(Job job)
    {
        if (job.Prompt.Length > 0) return true;
        job.Prompt = BuildHeroPrompt(job, job.Variant);
        if (job.Prompt.Length == 0) return false;

        var framing = HeroFramings[job.Variant % HeroFramings.Length].Split('.')[0];
        Log($"  Draft {job.Variant + 1} — {framing}.");
        Log($"  Reference: {job.ImageFile} (centre-cropped to drop the sleeve chrome)");
        Log($"  Prompt: {(job.Prompt.Length > 260 ? job.Prompt[..260] + "…" : job.Prompt)}");
        return true;
    }

    /// <summary>The voice folder an album job came from — its parent directory.</summary>
    private static string VoiceFolderOf(Job job) =>
        Path.GetFileName(Path.GetDirectoryName(job.AlbumDir) ?? "") ?? "";

    // ========================================================================
    //  THE RUN
    // ========================================================================

    private async void BtnHeroesGenerate_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;

        if (HeroRoot.Length == 0) { Log("No repo root — cannot work out where heroes go."); return; }
        try { Directory.CreateDirectory(HeroRoot); }
        catch (Exception ex) { Log($"Could not create {HeroRoot}: {ex.Message}"); return; }

        // Facts are loaded once per run, not per album: the theme and genre files
        // are two whole-file reads and a sweep touches them for every job.
        LoadAlbumFacts();

        var drafts = int.TryParse((CmbHeroDrafts?.SelectedItem as ComboBoxItem)?.Tag as string, out var d)
            ? Math.Max(1, d) : 1;
        var redo = ChkHeroesRegenerate?.IsChecked == true;
        var markedOnly = ChkHeroesMarkedOnly?.IsChecked == true;

        var queue = new List<Job>();
        foreach (var p in _heroes)
        {
            // Just the pulled ones: an album that never had a hero is not a
            // complaint being answered, and a batch of regenerations is easier to
            // review when it is only regenerations.
            if (markedOnly && !p.MarkedForRedo) continue;
            // An album that already has a hero is left alone unless asked for
            // again. The picture in app/web/public is one the site may already be
            // serving, and quietly making a second is how a page changes without
            // anyone deciding it should.
            if (p.HasHero && !redo) continue;
            var voice = VoiceFolderOf(p);
            for (int i = 0; i < drafts; i++)
            {
                queue.Add(new Job
                {
                    // Unique per DRAFT and per press, so pressing Generate twice
                    // does not find every job already in _completedPaths.
                    Path = $"{p.AlbumDir}#hero{i}@{DateTime.UtcNow.Ticks}",
                    Kind = Kind.Hero,
                    AlbumDir = p.AlbumDir,
                    ArtworkDir = p.ArtworkDir,
                    Code = p.Code,
                    Title = drafts == 1 ? p.Title : $"{p.Title} — draft {i + 1}",
                    Artist = p.Artist,
                    ImageFile = p.ImageFile,
                    HeroFile = p.HeroFile,
                    Variant = i,
                    // Never overwritten: draft 1 takes <CODE>.webp, and anything
                    // after it takes <CODE> (2).webp and so on.
                    OutFile = UniquePath(Path.Combine(HeroDirFor(voice), p.Code + ".webp")),
                    Webp = true,
                    Prompt = "",
                });
            }
        }

        if (queue.Count == 0)
        {
            Log(_heroes.Count == 0 ? "Nothing listed — pick a persona whose albums have cover art."
                : markedOnly ? "Nothing here is marked for regeneration. Untick “Only marked” or mark a hero first."
                : "Every listed album already has a hero. Tick “Regenerate” to make another.");
            return;
        }

        Log($"\n=== Hero images: {queue.Count} image(s) ===");
        Log($"  shape   16:9 widescreen, reverse-engineered from each album's own cover");
        Log($"  output  {HeroRoot}\\<persona>\\<CODE>.webp");
        Log($"  served  /images/heroes/<persona>/<CODE>.webp");

        await RunBatch(queue, Kind.Hero);
    }
}
