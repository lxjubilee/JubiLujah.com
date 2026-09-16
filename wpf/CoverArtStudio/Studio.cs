using System.IO;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace JubileeCoverArtStudio;

// ============================================================================
//  IMAGE STUDIO
// ============================================================================
//
// Free-form generation. Same browser, same runner, same save path as the covers
// view — but the job comes from the prompt box instead of from an album, so it
// will make anything: a hero image, a thumbnail, a poster, a banner, a texture.
//
// WHAT IT DELIBERATELY DOES NOT DO.
//
//   1. It does NOT append the persona clauses. No age, no build, no wardrobe, no
//      "the subject is the artist". Those exist because a COVER has to sit beside
//      eighty other covers of the same person; a free generation has no such
//      obligation and the clauses would fight whatever was actually asked for.
//      Everything this sends is what was typed, plus a shape and a
//      "return the picture, do not chat about it".
//
//   2. It does NOT write into the catalogue. The output folder is its own setting
//      and defaults to review\_studio inside the repo — outside every album's
//      artwork folder, and outside the per-persona review folders the covers view
//      writes to. A free generation has no album to belong to, and dropping one
//      into artwork/ would put an unreviewed picture exactly where the publish
//      pipeline reads approved masters from.
//
// THE GALLERY IS READ OFF DISK, not remembered. Everything the output folder
// holds is listed, newest first, whether this session made it or not — so it
// survives a restart, and so a file deleted in Explorer disappears from it on the
// next Refresh instead of lingering as a row that opens nothing.

public partial class MainWindow
{
    /// <summary>What is in the output folder now, newest first.</summary>
    private readonly List<GalleryItem> _studioGallery = new();

    /// <summary>Reference images the next run will attach, as absolute paths.</summary>
    private readonly List<string> _studioRefs = new();

    /// <summary>
    /// One row in the gallery. The thumbnail is decoded at 80px and frozen — the
    /// folder can hold hundreds of 1024px pictures, and decoding those at full
    /// size to draw them at 40px would cost hundreds of megabytes for no visible
    /// difference.
    /// </summary>
    /// 🔴 PROPERTIES, NOT FIELDS — WPF binding cannot see a public field, and as
    /// fields Title, Detail and Thumb bound to nothing: the gallery drew empty rows
    /// with no thumbnails. See MainWindow.xaml.cs Row for the full note.
    private sealed class GalleryItem
    {
        public string File { get; set; } = "";
        public string Title { get; set; } = "";
        public string Detail { get; set; } = "";
        public BitmapSource? Thumb { get; set; }
        public override string ToString() => Title;
    }

    // ========================================================================
    //  THE GALLERY
    // ========================================================================

    private void BtnStudioRefresh_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        ScanStudio();
    }

    /// <summary>
    /// List the output folder, newest first.
    ///
    /// Only the four formats the app can actually decode. A stray .txt or .psd in
    /// the folder would otherwise become a row with no thumbnail that throws when
    /// selected.
    /// </summary>
    private void ScanStudio()
    {
        _studioGallery.Clear();

        if (_studioRoot.Length == 0)
        {
            Log("No studio output folder set — put one in Settings.");
            RenderStudio();
            return;
        }

        try
        {
            Directory.CreateDirectory(_studioRoot);
            var exts = new[] { ".webp", ".png", ".jpg", ".jpeg" };
            var files = Directory.EnumerateFiles(_studioRoot)
                .Where(f => exts.Contains(Path.GetExtension(f), StringComparer.OrdinalIgnoreCase))
                .Select(f => new FileInfo(f))
                .OrderByDescending(f => f.LastWriteTimeUtc)
                .Take(300)      // a cap, not a filter: 300 thumbnails is already a long scroll
                .ToList();

            foreach (var f in files)
            {
                _studioGallery.Add(new GalleryItem
                {
                    File = f.FullName,
                    Title = Path.GetFileNameWithoutExtension(f.Name),
                    Detail = $"{f.LastWriteTime:yyyy-MM-dd HH:mm}  ·  {f.Length / 1024:N0} KB",
                    Thumb = LoadThumb(f.FullName),
                });
            }

            Log($"Studio: {_studioGallery.Count} image(s) in {_studioRoot}.");
        }
        catch (Exception ex)
        {
            Log($"Could not read the studio folder {_studioRoot}: {ex.Message}");
        }

        RenderStudio();
    }

    private void RenderStudio()
    {
        if (LstStudio == null) return;
        LstStudio.ItemsSource = null;
        LstStudio.ItemsSource = _studioGallery;
        if (_studioGallery.Count == 0)
        {
            StudioPreviewImage.Source = null;
            StudioPreviewEmpty.Text = "Nothing in the output folder yet.\nType a prompt and press Generate Images.";
            StudioPreviewEmpty.Visibility = Visibility.Visible;
            StudioPreviewCaption.Text = "";
        }
    }

    private void LstStudio_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (LstStudio?.SelectedItem is not GalleryItem g) return;
        ShowStudioPreviewFile(g.File);
    }

    private void ShowStudioPreviewFile(string file)
    {
        if (StudioPreviewImage == null) return;
        StudioPreviewImage.Source = null;

        if (file.Length == 0 || !File.Exists(file))
        {
            StudioPreviewEmpty.Text = "That file is no longer on disk. Press Refresh.";
            StudioPreviewEmpty.Visibility = Visibility.Visible;
            StudioPreviewCaption.Text = "";
            return;
        }

        try
        {
            var (img, w, h) = LoadPreview(file);
            StudioPreviewImage.Source = img;
            StudioPreviewEmpty.Visibility = Visibility.Collapsed;
            StudioPreviewCaption.Text = $"{Path.GetFileName(file)}  ·  {w}×{h}  ·  {new FileInfo(file).Length / 1024:N0} KB";
        }
        catch (Exception ex)
        {
            StudioPreviewEmpty.Text = "Could not read this image.";
            StudioPreviewEmpty.Visibility = Visibility.Visible;
            StudioPreviewCaption.Text = ex.Message;
        }
    }

    private void BtnStudioFolder_Click(object sender, RoutedEventArgs e)
    {
        ReadRootFromUi();
        if (_studioRoot.Length == 0) { Log("No studio output folder set — put one in Settings."); return; }
        Directory.CreateDirectory(_studioRoot);
        Open(_studioRoot);
    }

    // ========================================================================
    //  REFERENCE IMAGES
    // ========================================================================

    private void BtnRefAdd_Click(object sender, RoutedEventArgs e)
    {
        var dlg = new Microsoft.Win32.OpenFileDialog
        {
            Title = "Reference images",
            Multiselect = true,
            Filter = "Images|*.png;*.jpg;*.jpeg;*.webp;*.bmp|All files|*.*",
        };
        if (dlg.ShowDialog(this) != true) return;
        foreach (var f in dlg.FileNames) AddReference(f);
        RenderRefs();
    }

    private void BtnRefClear_Click(object sender, RoutedEventArgs e)
    {
        _studioRefs.Clear();
        RenderRefs();
    }

    private void RefDrop_DragOver(object sender, DragEventArgs e)
    {
        e.Effects = ImageDrop(e).Length > 0 ? DragDropEffects.Copy : DragDropEffects.None;
        if (sender is Border b && e.Effects == DragDropEffects.Copy)
            b.BorderBrush = new SolidColorBrush(Color.FromRgb(0xE6, 0xAC, 0x00));
        e.Handled = true;
    }

    private void RefDrop_DragLeave(object sender, DragEventArgs e) => ResetDropBorder(sender);

    private void RefDrop_Drop(object sender, DragEventArgs e)
    {
        ResetDropBorder(sender);
        foreach (var f in ImageDrop(e)) AddReference(f);
        RenderRefs();
        e.Handled = true;
    }

    private static void ResetDropBorder(object sender)
    {
        if (sender is Border b) b.BorderBrush = new SolidColorBrush(Color.FromRgb(0x2c, 0x30, 0x40));
    }

    /// <summary>Image files in a drop, or an empty array for anything else.</summary>
    private static string[] ImageDrop(DragEventArgs e)
    {
        if (!e.Data.GetDataPresent(DataFormats.FileDrop)) return Array.Empty<string>();
        var exts = new[] { ".png", ".jpg", ".jpeg", ".webp", ".bmp" };
        return ((string[])e.Data.GetData(DataFormats.FileDrop)!)
            .Where(f => exts.Contains(Path.GetExtension(f), StringComparer.OrdinalIgnoreCase))
            .ToArray();
    }

    /// <summary>
    /// Add one reference, if it is not already there.
    ///
    /// Capped at four. Every reference is a separate upload on every turn, and past
    /// three or four the attach step takes longer than the generation does — and
    /// the model weighs the later ones less anyway.
    /// </summary>
    private void AddReference(string file)
    {
        if (!File.Exists(file)) return;
        if (_studioRefs.Contains(file, StringComparer.OrdinalIgnoreCase)) return;
        if (_studioRefs.Count >= 4) { Log("Four references is the limit — the rest were ignored."); return; }
        _studioRefs.Add(file);
    }

    private void RenderRefs()
    {
        if (RefDropLabel == null) return;
        RefDropLabel.Text = _studioRefs.Count == 0
            ? "Drop images here"
            : string.Join(", ", _studioRefs.Select(Path.GetFileName));
        RefDrop.ToolTip = _studioRefs.Count == 0
            ? "Drop image files here, or press Add."
            : string.Join("\n", _studioRefs);
    }

    // ========================================================================
    //  THE RUN
    // ========================================================================

    private async void BtnStudioGenerate_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;

        var prompt = (TxtPrompt.Text ?? "").Trim();
        if (prompt.Length == 0) { Log("Nothing to make — type a prompt first."); return; }

        if (_studioRoot.Length == 0) { Log("No studio output folder set — put one in Settings."); return; }
        try { Directory.CreateDirectory(_studioRoot); }
        catch (Exception ex) { Log($"Could not create {_studioRoot}: {ex.Message}"); return; }

        var count = int.TryParse((CmbCount?.SelectedItem as ComboBoxItem)?.Tag as string, out var n) ? Math.Max(1, n) : 1;
        var stem = NameFor(prompt);
        var webp = ChkStudioWebp?.IsChecked == true;

        // The extension here is provisional. SaveImage replaces it with whatever
        // the bytes actually turn out to be — WebP when the conversion wins, and
        // the sniffed true format when it does not.
        var queue = new List<Job>();
        for (int i = 0; i < count; i++)
        {
            var name = count == 1 ? stem : $"{stem} - {i + 1}";
            queue.Add(new Job
            {
                // Unique per draft AND per press. Without the timestamp, pressing
                // Generate twice with the same prompt would find every job already
                // in _completedPaths and skip the lot — reporting "3 skipped
                // (already done)" for pictures the user had just asked for again.
                Path = $"studio:{stem}#{i}@{DateTime.UtcNow.Ticks}",
                Kind = Kind.Studio,
                Title = name,
                Prompt = prompt,
                OutFile = UniquePath(Path.Combine(_studioRoot, name + (webp ? ".webp" : ".png"))),
                Variant = i,
                References = new List<string>(_studioRefs),
                Webp = webp,
            });
        }

        var shapeLabel = (CmbShape?.SelectedItem as ComboBoxItem)?.Content?.ToString() ?? "";
        Log($"\n=== Image Studio: {count} image(s) ===");
        Log($"  shape   {shapeLabel}");
        Log($"  output  {_studioRoot}");
        if (_studioRefs.Count > 0)
            Log($"  refs    {string.Join(", ", _studioRefs.Select(Path.GetFileName))} — attached to every draft, uncropped.");
        Log($"  prompt  {(prompt.Length > 220 ? prompt[..220] + "…" : prompt)}");

        await RunBatch(queue, Kind.Studio);
    }

    /// <summary>
    /// The filename stem: what the user typed in the name box, or the first few
    /// words of the prompt plus the date.
    ///
    /// The date is in the derived name and not the typed one on purpose. A typed
    /// name is a deliberate choice and should be honoured exactly; a derived one is
    /// a guess, and two guesses from similar prompts a week apart would otherwise
    /// collide into "-2", "-3" with nothing to tell them apart.
    /// </summary>
    private string NameFor(string prompt)
    {
        var typed = (TxtStudioName.Text ?? "").Trim();
        if (typed.Length > 0) return FileSafe(typed);

        var words = Regex.Replace(prompt, @"[^\w\s-]", " ")
            .Split(' ', StringSplitOptions.RemoveEmptyEntries)
            .Take(6);
        var stem = string.Join(' ', words);
        if (stem.Length == 0) stem = "image";
        if (stem.Length > 60) stem = stem[..60].TrimEnd();
        return FileSafe($"{stem} {DateTime.Now:yyyy-MM-dd}");
    }

    /// <summary>
    /// A path nothing is using yet, by appending (2), (3) … to the stem.
    ///
    /// Never overwrite. A generated picture is the product of a GPU render and a
    /// two-minute wait; silently replacing one because a prompt was run twice is
    /// the one failure mode that cannot be undone from inside the app.
    /// </summary>
    private static string UniquePath(string wanted)
    {
        if (!File.Exists(wanted)) return wanted;
        var dir = Path.GetDirectoryName(wanted)!;
        var stem = Path.GetFileNameWithoutExtension(wanted);
        var ext = Path.GetExtension(wanted);
        for (int i = 2; i < 500; i++)
        {
            var candidate = Path.Combine(dir, $"{stem} ({i}){ext}");
            if (!File.Exists(candidate)) return candidate;
        }
        // 500 collisions on one stem is not a name problem any more.
        return Path.Combine(dir, $"{stem} {DateTime.Now:HHmmss}{ext}");
    }
}
