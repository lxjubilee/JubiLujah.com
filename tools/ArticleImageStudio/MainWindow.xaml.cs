using System.IO;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Threading;
using ImageMagick;
using Microsoft.Web.WebView2.Core;

namespace ArticleImageStudio;

// A WPF host around a real WebView2 (Edge/Chromium) browser. You log in to
// ChatGPT by hand in the embedded browser — a genuine browser, so Cloudflare's
// human-check passes normally — and the session cookies persist in the app's
// own data folder. The app then drives YOUR authenticated session with injected
// JavaScript to submit each article's image prompt, waits for the image, saves
// it under a random 12-char name, and wires it into the article.
//
// NOTE: this automates the ChatGPT web UI, which may conflict with OpenAI's
// Terms of Use. It runs against your own logged-in session at your direction.
public partial class MainWindow : Window
{
    private string _root = "";
    private string _articlesJson = "";
    private string _imagesDir = "";
    private string _mdDir = "";
    private string _userDataFolder = "";
    private string _backstageJson = "";
    private string _backstageImagesDir = "";
    private string _genBackstage = "";
    private string _regenQueue = "";

    // Backstage mode: generate slug-named images for the /backstage song pieces
    // instead of the /articles set. Also forced ON while draining a web-queued
    // regeneration request, so those always save to /images/backstage.
    private bool Backstage => ChkBackstage.IsChecked == true || _forceBackstage;
    private bool _forceBackstage;

    // Poll the web-written regen queue; process one request per idle tick.
    private DispatcherTimer? _queueTimer;
    private bool _queueBusy;
    private int _queueWaitLogs;

    private bool _ready;
    private bool _running;
    private bool _homeRetried;
    private CancellationTokenSource? _cts;
    private TaskCompletionSource<string>? _imageMsg;

    // Durable "already generated" tracking is the article's `image` field in
    // articles.json (survives restarts). This session set is a second guard so a
    // run never loops on the same article even if a write hiccups.
    private readonly HashSet<string> _completedSlugs = new();

    private const string CHATGPT = "https://chatgpt.com/";

    // Appended to every prompt so ChatGPT renders a wide hero image, not a square.
    private const string AspectSuffix =
        "\n\nIMPORTANT: Produce this image in a 16:9 widescreen landscape aspect ratio " +
        "(wide horizontal orientation — not square, not portrait).";

    public MainWindow()
    {
        InitializeComponent();
        ResolvePaths();
        Loaded += async (_, _) => await InitAsync();
    }

    // ---- paths -------------------------------------------------------------
    private void ResolvePaths()
    {
        var dir = new DirectoryInfo(AppContext.BaseDirectory);
        while (dir != null)
        {
            if (File.Exists(Path.Combine(dir.FullName, "app", "web", "public", "articles", "articles.json")))
                break;
            dir = dir.Parent;
        }
        _root = dir?.FullName ?? @"W:\JubileePraise.com";
        _articlesJson = Path.Combine(_root, "app", "web", "public", "articles", "articles.json");
        _imagesDir = Path.Combine(_root, "app", "web", "public", "images", "articles");
        _mdDir = Path.Combine(_root, "core", "articles");
        _userDataFolder = Path.Combine(_root, "tools", "ArticleImageStudio", ".webview2");
        _backstageJson = Path.Combine(_root, "app", "web", "public", "backstage", "backstage.json");
        _backstageImagesDir = Path.Combine(_root, "app", "web", "public", "images", "backstage");
        _genBackstage = Path.Combine(_root, "app", "web", "scripts", "gen-backstage.mjs");
        _regenQueue = Path.Combine(_root, "tools", "ArticleImageStudio", "regen-queue");
        Directory.CreateDirectory(_imagesDir);
        Directory.CreateDirectory(_userDataFolder);
        Directory.CreateDirectory(_backstageImagesDir);
        Directory.CreateDirectory(_regenQueue);
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
            Log($"Ready. Repo: {_root}");
            Log($"Images → {_imagesDir}");
            Log("Log in to ChatGPT in the browser, then click Generate.");
            LoadPending();
            StartQueueWatcher();
        }
        catch (Exception ex)
        {
            Log("Init failed: " + ex.Message);
            MessageBox.Show(
                "WebView2 failed to start. Make sure the WebView2 Runtime is installed " +
                "(it ships with Edge on Windows 11).\n\n" + ex.Message,
                "Article Image Studio", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    // ---- pending list ------------------------------------------------------
    private List<ArticleItem> _items = new();

    private void LoadPending()
    {
        _items.Clear();
        PendingList.Items.Clear();
        var jsonPath = Backstage ? _backstageJson : _articlesJson;
        var listKey = Backstage ? "pieces" : "articles";
        if (!File.Exists(jsonPath)) { Log(Path.GetFileName(jsonPath) + " not found."); return; }
        var root = JsonNode.Parse(File.ReadAllText(jsonPath));
        var arr = root?[listKey] as JsonArray;
        if (arr == null) return;
        bool showAll = ChkShowAll.IsChecked == true;
        foreach (var n in arr)
        {
            if (n == null) continue;
            var img = n["image"]?.GetValue<string>();
            var has = !string.IsNullOrWhiteSpace(img);
            if (!showAll && has) continue;
            var item = new ArticleItem
            {
                Slug = n["slug"]?.GetValue<string>() ?? "",
                Title = n["title"]?.GetValue<string>() ?? "",
                Prompt = n["imagePrompt"]?.GetValue<string>() ?? "",
                HasImage = has,
            };
            if (string.IsNullOrWhiteSpace(item.Prompt)) continue;
            _items.Add(item);
            PendingList.Items.Add((has ? "✓ " : "• ") + item.Title);
        }
        // Reconcile the session "done" set with reality: if an item is back on the
        // list without an image (e.g. a prior save that didn't persist), drop its
        // stale completed-mark so it stays eligible — otherwise the list count and
        // the auto-loop's pending count disagree ("N listed" vs "nothing pending").
        foreach (var it in _items)
            if (!it.HasImage && !string.IsNullOrEmpty(it.Slug)) _completedSlugs.Remove(it.Slug);
        Log($"{_items.Count} {(Backstage ? "backstage piece" : "article")}(s) listed.");
    }

    // ---- web-triggered regeneration queue ----------------------------------
    // The website (admin "regenerate" icon on a Backstage card) drops a request
    // file `regen-queue/<slug>.json`. This timer drains it: for each request we
    // generate that piece's image against the logged-in ChatGPT session, save
    // /images/backstage/<slug>.webp, rebuild backstage.json, and write back
    // `regen-queue/<slug>.status.json` so the site can swap the art in place.
    private void StartQueueWatcher()
    {
        _queueTimer = new DispatcherTimer { Interval = TimeSpan.FromSeconds(3) };
        _queueTimer.Tick += async (_, _) => { WriteHeartbeat(); await ProcessQueueTick(); };
        _queueTimer.Start();
        WriteHeartbeat();
        Log("Watching regen-queue for website requests…");
    }

    // A liveness beat the website reads (regen-queue/.studio-alive) so the
    // regenerate button can tell "queued, Studio generating" from "Studio isn't
    // running" — instead of spinning silently.
    private void WriteHeartbeat()
    {
        try
        {
            File.WriteAllText(
                Path.Combine(_regenQueue, ".studio-alive"),
                DateTimeOffset.UtcNow.ToUnixTimeMilliseconds().ToString());
        }
        catch { /* non-fatal */ }
    }

    private async Task ProcessQueueTick()
    {
        if (_queueBusy || _running || !_ready) return;
        string? reqFile;
        try
        {
            reqFile = Directory.EnumerateFiles(_regenQueue, "*.json")
                .FirstOrDefault(f => !f.EndsWith(".status.json", StringComparison.OrdinalIgnoreCase));
        }
        catch { return; }
        if (reqFile == null) { _queueWaitLogs = 0; return; }

        // Only consume a request once the user is actually logged in (the chat
        // composer is present); otherwise leave it queued and wait.
        if (Json(await Wv.CoreWebView2.ExecuteScriptAsync(ComposerPresentScript())) != "yes")
        {
            if (_queueWaitLogs++ % 10 == 0)
                Log("Regen request waiting — log in to ChatGPT so it can be generated.");
            return;
        }

        _queueBusy = true;
        var slug = "";
        try
        {
            slug = JsonNode.Parse(File.ReadAllText(reqFile))?["slug"]?.GetValue<string>() ?? "";
            if (slug.Length == 0) { File.Delete(reqFile); return; }

            var item = BuildBackstageItem(slug);
            if (item == null)
            {
                Log($"Regen: '{slug}' not found in backstage.json — skipping.");
                WriteRegenStatus(slug, "error", null, "Piece not found");
                File.Delete(reqFile);
                return;
            }

            Log($"\nRegen request from website → {item.Title} ({slug})");

            // An explicit website request must ALWAYS regenerate, even if this slug
            // was generated earlier in the session — clear the "already done" guard.
            _completedSlugs.Remove(slug);
            _forceBackstage = true;
            var done = await RunBatch(new() { item });
            _forceBackstage = false;

            if (done > 0)
            {
                WriteRegenStatus(slug, "done", $"/images/backstage/{slug}.webp", "");
                Log($"Regen done → {item.Title}");
            }
            else
            {
                WriteRegenStatus(slug, "error", null, "No new image produced (login / prompt / layout?)");
                Log($"Regen failed → {item.Title}");
            }
            File.Delete(reqFile);
        }
        catch (Exception ex)
        {
            Log("Regen error: " + ex.Message);
            if (slug.Length > 0) WriteRegenStatus(slug, "error", null, ex.Message);
            try { File.Delete(reqFile); } catch { }
        }
        finally
        {
            _forceBackstage = false;
            _queueBusy = false;
        }
    }

    // Build a generation job from a backstage slug (its title + image prompt),
    // regardless of whether it already has an image (regeneration is deliberate).
    private ArticleItem? BuildBackstageItem(string slug)
    {
        if (!File.Exists(_backstageJson)) return null;
        var arr = JsonNode.Parse(File.ReadAllText(_backstageJson))?["pieces"] as JsonArray;
        if (arr == null) return null;
        foreach (var n in arr)
        {
            if (n?["slug"]?.GetValue<string>() != slug) continue;
            var prompt = n["imagePrompt"]?.GetValue<string>() ?? "";
            if (string.IsNullOrWhiteSpace(prompt)) return null;
            return new ArticleItem
            {
                Slug = slug,
                Title = n["title"]?.GetValue<string>() ?? slug,
                Prompt = prompt,
                HasImage = false, // force generation
            };
        }
        return null;
    }

    private void WriteRegenStatus(string slug, string status, string? image, string message)
    {
        try
        {
            var obj = new JsonObject
            {
                ["slug"] = slug,
                ["status"] = status,
                ["image"] = image,
                ["message"] = message,
                ["ts"] = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
            };
            File.WriteAllText(Path.Combine(_regenQueue, slug + ".status.json"), obj.ToJsonString());
        }
        catch (Exception ex) { Log("Could not write regen status: " + ex.Message); }
    }

    // ---- buttons -----------------------------------------------------------
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

    private void BtnReload_Click(object sender, RoutedEventArgs e) => LoadPending();

    private void ChkBackstage_Click(object sender, RoutedEventArgs e) => LoadPending();

    private async void BtnGenNext_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;
        // The next article still missing an image.
        var next = _items.FirstOrDefault(x => !x.HasImage);
        if (next == null) { Log("Nothing left to generate — every article has an image."); return; }
        await RunBatch(new() { next });
    }

    private async void BtnGenAll_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;
        var pending = _items.Where(x => !x.HasImage).ToList();
        if (pending.Count == 0) { Log("Nothing pending. (Tick 'Show all' + select to regenerate one.)"); return; }
        await RunBatch(pending);
    }

    private void BtnStop_Click(object sender, RoutedEventArgs e)
    {
        ChkAutoAll.IsChecked = false;
        _cts?.Cancel();
        Log("Stopping after the current image…");
    }

    // Checked → generate every remaining image back-to-back, no clicking.
    // Unchecked while running → stop.
    private async void ChkAutoAll_Click(object sender, RoutedEventArgs e)
    {
        if (ChkAutoAll.IsChecked == true)
        {
            if (_running) return;
            if (!EnsureReady()) { ChkAutoAll.IsChecked = false; return; }
            var pending = _items
                .Where(x => !x.HasImage && !(x.Slug != null && _completedSlugs.Contains(x.Slug)))
                .ToList();
            if (pending.Count == 0)
            {
                Log("Nothing pending — every article already has an image.");
                ChkAutoAll.IsChecked = false;
                return;
            }
            Log($"Auto mode ON — generating {pending.Count} pending image(s) with no clicking…");
            await RunBatch(pending);
            ChkAutoAll.IsChecked = false; // finished or stopped
        }
        else
        {
            _cts?.Cancel(); // unchecking stops the run
        }
    }

    // Manual fallback: grab whatever generated image is showing right now and
    // save it — wired to the selected article, or the next pending one.
    private async void BtnDownload_Click(object sender, RoutedEventArgs e)
    {
        if (!EnsureReady()) return;
        BtnDownload.IsEnabled = false;
        try
        {
            var all = await GetImageList();
            var src = all.LastOrDefault();
            if (src == null) { Log("No finished image found on the page to download."); return; }

            ArticleItem? target = null;
            var i = PendingList.SelectedIndex;
            if (i >= 0 && i < _items.Count) target = _items[i];
            else target = _items.FirstOrDefault(x => !x.HasImage);

            Log($"Manual download → {target?.Title ?? "(unwired)"}");
            var ok = await SaveImage(src, target, CancellationToken.None);
            if (ok) LoadPending();
        }
        catch (Exception ex) { Log("Manual download failed: " + ex.Message); }
        finally { BtnDownload.IsEnabled = true; }
    }

    private bool EnsureReady()
    {
        if (!_ready) { Log("Browser not ready yet."); return false; }
        return true;
    }

    // ---- batch driver ------------------------------------------------------
    // Returns the number of images actually generated in this batch.
    private async Task<int> RunBatch(List<ArticleItem> jobs)
    {
        if (_running) { Log("Already running — Stop (or uncheck Auto) first."); return 0; }
        _running = true;
        _cts = new CancellationTokenSource();
        SetBusy(true);
        int done = 0, skipped = 0, inThread = 0;
        try
        {
            for (int i = 0; i < jobs.Count; i++)
            {
                _cts.Token.ThrowIfCancellationRequested();
                var job = jobs[i];
                // Never regenerate one already done (this session or a prior run).
                if (job.Slug != null && (_completedSlugs.Contains(job.Slug) || job.HasImage))
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
                    if (job.Slug != null) _completedSlugs.Add(job.Slug);
                    if (++inThread >= 10)
                    {
                        Log("  Reached 10 images in this conversation — the next one starts a new thread.");
                        inThread = 0;
                    }
                    // Human-like random pause (1–10s) before the next image.
                    if (i < jobs.Count - 1)
                    {
                        var wait = _rng.Next(1000, 10001);
                        Log($"  Pausing {wait / 1000.0:0.0}s before the next image…");
                        await Task.Delay(wait, _cts.Token);
                    }
                }
            }
        }
        catch (OperationCanceledException) { Log("Stopped."); }
        catch (Exception ex) { Log("Error: " + ex.Message); }
        finally
        {
            _running = false;
            SetBusy(false);
            if (Backstage && done > 0) RebuildBackstage();
            LoadPending();
            Log($"\nFinished. {done} generated" + (skipped > 0 ? $", {skipped} skipped (already done)" : "") + ".");
        }
        return done;
    }

    // After generating backstage images, refresh backstage.json so the cards pick
    // up the new slug-named files under /images/backstage.
    private void RebuildBackstage()
    {
        Log("Rebuilding backstage.json …");
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = "node",
                Arguments = "\"" + _genBackstage + "\"",
                WorkingDirectory = Path.Combine(_root, "app", "web"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
            };
            using var p = System.Diagnostics.Process.Start(psi);
            p?.WaitForExit(30000);
        }
        catch (Exception ex) { Log("gen-backstage failed: " + ex.Message); }
    }

    private async Task<bool> GenerateOne(ArticleItem job, bool newThread, CancellationToken ct)
    {
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
        if (!await WaitForComposer(ct)) { Log("  ✗ Chat box never appeared — are you logged in? (composer not found)"); return false; }

        // Remember which images are already on the page so we only accept a NEW one.
        var baseline = new HashSet<string>(await GetImageList());
        Log($"  Sending prompt… ({baseline.Count} image(s) already on the page)");

        // Submit (with the 16:9 landscape directive appended).
        var submit = Json(await Wv.CoreWebView2.ExecuteScriptAsync(SubmitScript(job.Prompt + AspectSuffix)));
        Log($"  submit result: {submit}");
        if (submit == "no-composer") { Log("  ✗ Could not find the chat box to type into."); return false; }

        Log("  Waiting for the image to finish generating…");
        var src = await WaitForNewImage(baseline, ct);
        if (src == null) { Log("  ✗ No finished image detected (ChatGPT may have asked a question, refused, or its layout changed)."); return false; }
        Log("  ✓ Image finished — downloading…");

        return await SaveImage(src, job, ct);
    }

    // Waits for a generated image that (a) was not already present before we
    // submitted, and (b) holds the same URL across two consecutive polls — i.e.
    // generation has settled, not a streaming/placeholder frame.
    private async Task<string?> WaitForNewImage(HashSet<string> baseline, CancellationToken ct)
    {
        var deadline = DateTime.UtcNow.AddMinutes(6);
        string? last = null;
        int stable = 0, polls = 0;
        while (DateTime.UtcNow < deadline)
        {
            ct.ThrowIfCancellationRequested();
            var current = await GetImageList();
            var newest = current.LastOrDefault(s => !baseline.Contains(s));
            if (newest != null)
            {
                if (newest == last) stable++;
                else { last = newest; stable = 1; }
                if (stable >= 2) return newest; // unchanged across two checks → done
            }
            if (++polls % 5 == 0)
                Log($"    …still waiting ({current.Count} image(s) on page, ~{(int)(deadline - DateTime.UtcNow).TotalSeconds}s left)");
            await Task.Delay(3000, ct);
        }
        return null;
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

    // Fetch the image bytes inside the page (keeps the auth session), receive
    // them via a web message, save under a random name, and wire into the article.
    private async Task<bool> SaveImage(string src, ArticleItem? job, CancellationToken ct)
    {
        _imageMsg = new TaskCompletionSource<string>();
        await Wv.CoreWebView2.ExecuteScriptAsync(FetchScript(src));
        var b64 = await WaitForMessage(TimeSpan.FromSeconds(60), ct);
        if (b64 == null) { Log("  Failed to download the image bytes."); return false; }

        var raw = Convert.FromBase64String(b64);
        // ChatGPT hands back a PNG; re-encode to real WebP so the .webp files we
        // write actually are WebP (smaller, correct format) rather than PNG bytes
        // under a .webp name.
        var bytes = ToWebp(raw);
        if (bytes.Length != raw.Length)
            Log($"  Converted PNG → WebP: {raw.Length:N0} → {bytes.Length:N0} bytes");

        // Backstage: save a slug-named file; gen-backstage resolves it into the card.
        if (Backstage)
        {
            var slug = job?.Slug ?? "";
            if (slug.Length == 0) { Log("  (no slug — skipped)"); return false; }
            var bdest = Path.Combine(_backstageImagesDir, slug + ".webp");
            await File.WriteAllBytesAsync(bdest, bytes, ct);
            Log($"  Saved /images/backstage/{slug}.webp  ({bytes.Length:N0} bytes) → {job!.Title}");
            return true;
        }

        var name = RandomName(12) + ".webp";
        var dest = Path.Combine(_imagesDir, name);
        await File.WriteAllBytesAsync(dest, bytes, ct);
        // Serve under /images/ (the /articles/* path is shadowed by the removed
        // route on prod). gen-articles resolves the bare .md filename to this same
        // /images/articles/ path, so a recompile keeps the image wired.
        var webPath = "/images/articles/" + name;

        if (job?.Slug != null)
        {
            UpdateMdFrontmatter(job.Slug, name); // bare filename, after imagePrompt
            UpdateArticlesJson(job.Slug, webPath); // full path for the live site
            Log($"  Saved {webPath}  ({bytes.Length:N0} bytes) → {job.Title}");
        }
        else
        {
            Log($"  Saved {webPath}  ({bytes.Length:N0} bytes) — not wired to an article.");
        }
        return true;
    }

    // Re-encode downloaded image bytes (PNG/JPEG from ChatGPT) to real WebP.
    // Lossy q85 is near-visually-lossless for these photographic hero images and
    // much smaller than PNG. Falls back to the original bytes if the input can't
    // be decoded — we never drop an image over a conversion hiccup.
    private static byte[] ToWebp(byte[] input)
    {
        try
        {
            using var img = new MagickImage(input);
            img.Format = MagickFormat.WebP;
            img.Quality = 85;
            return img.ToByteArray();
        }
        catch
        {
            return input;
        }
    }

    // ---- navigation + messaging helpers ------------------------------------
    // Best-effort navigation: waits for the "completed" event but never hangs on
    // it — after the timeout it proceeds, and WaitForComposer confirms the page
    // is actually usable. (A hang here was what left the app stuck/disabled.)
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

    // ---- record the image into the article ---------------------------------
    // Writes `image: <filename>` into the article's frontmatter, immediately
    // after the `imagePrompt:` line, so the source carries the .webp filename and
    // the site builds /articles/images/<filename> from it.
    // The .md filename usually equals the slug, but retitled articles (dedup pass)
    // keep their ORIGINAL filename while carrying the new slug in frontmatter.
    // Locate by the frontmatter `slug:` line so the image write lands in the right
    // file — otherwise it silently misses and the next gen-articles recompile wipes
    // the image back out of articles.json.
    private string? FindMdBySlug(string slug)
    {
        try
        {
            foreach (var f in Directory.EnumerateFiles(_mdDir, "*.md"))
                if (Regex.IsMatch(File.ReadAllText(f), @"(?m)^slug:\s*" + Regex.Escape(slug) + @"\s*$"))
                    return f;
        }
        catch { }
        return null;
    }

    private void UpdateMdFrontmatter(string slug, string filename)
    {
        var file = Path.Combine(_mdDir, slug + ".md");
        if (!File.Exists(file)) file = FindMdBySlug(slug) ?? file;
        if (!File.Exists(file)) return;
        var raw = File.ReadAllText(file);
        var m = Regex.Match(raw, @"^(---\s*\n)([\s\S]*?)(\n---\s*\n)");
        if (!m.Success) return;
        var front = m.Groups[2].Value;
        if (Regex.IsMatch(front, @"(?m)^image:.*$"))
            front = Regex.Replace(front, @"(?m)^image:.*$", "image: " + filename);
        else if (Regex.IsMatch(front, @"(?m)^imagePrompt:.*$"))
            front = Regex.Replace(front, @"(?m)^(imagePrompt:.*)$", "$1\nimage: " + filename);
        else
            front = front + "\nimage: " + filename;
        raw = raw.Substring(0, m.Index) + m.Groups[1].Value + front + m.Groups[3].Value + raw.Substring(m.Index + m.Length);
        File.WriteAllText(file, raw);
    }

    private void UpdateArticlesJson(string slug, string webPath)
    {
        if (!File.Exists(_articlesJson)) return;
        var root = JsonNode.Parse(File.ReadAllText(_articlesJson));
        var arr = root?["articles"] as JsonArray;
        if (arr == null) return;
        foreach (var n in arr)
            if (n?["slug"]?.GetValue<string>() == slug) { n["image"] = webPath; break; }
        File.WriteAllText(_articlesJson, root!.ToJsonString(new JsonSerializerOptions { WriteIndented = true }));
    }

    // ---- injected scripts --------------------------------------------------
    private static string J(string s) => JsonSerializer.Serialize(s);

    private static string ComposerPresentScript() =>
        "(function(){var b=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');return b?'yes':'no';})();";

    private static string SubmitScript(string prompt) =>
        "(function(){var P=" + J(prompt) + ";" +
        "var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=\"true\"]');" +
        "if(!box)return 'no-composer';box.focus();" +
        "try{document.execCommand('selectAll',false,null);document.execCommand('insertText',false,P);}catch(e){}" +
        "if(!box.textContent||box.textContent.trim()===''){box.textContent=P;}" +
        "box.dispatchEvent(new Event('input',{bubbles:true}));" +
        "setTimeout(function(){var btn=document.querySelector('button[data-testid=\"send-button\"]')||document.querySelector('button[aria-label=\"Send prompt\"]');" +
        "if(btn){btn.click();}else{box.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));}},450);" +
        "return 'submitted';})();";

    // Returns every finished, LARGE image on the page, in DOM order (last =
    // most recent). We detect by size rather than URL: ChatGPT serves generated
    // images from signed URLs that don't match any fixed pattern, but the
    // generated image is always the big, fully-loaded one — UI chrome (avatars,
    // icons, inline SVGs) is small and gets filtered out by the size gate.
    private static string ListImagesScript() =>
        "(function(){var out=[];var imgs=document.querySelectorAll('img');" +
        "for(var i=0;i<imgs.length;i++){var im=imgs[i];var s=im.currentSrc||im.src||'';" +
        "if(!s||s.indexOf('data:image/svg')===0)continue;" +
        "if(im.complete&&(im.naturalWidth||0)>=400&&(im.naturalHeight||0)>=400){out.push(s);}}" +
        "return out;})();";

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
    private static string RandomName(int n)
    {
        const string a = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        var sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) sb.Append(a[_rng.Next(a.Length)]);
        return sb.ToString();
    }

    // ---- ui plumbing -------------------------------------------------------
    private void SetBusy(bool busy)
    {
        BtnGenNext.IsEnabled = !busy;
        BtnGenAll.IsEnabled = !busy;
        BtnDownload.IsEnabled = !busy;
        BtnStop.IsEnabled = busy;
    }

    private void Log(string msg)
    {
        if (!Dispatcher.CheckAccess()) { Dispatcher.Invoke(() => Log(msg)); return; }
        LogBox.AppendText(msg + "\n");
        LogBox.ScrollToEnd();
    }

    private class ArticleItem
    {
        public string? Slug;
        public string Title = "";
        public string Prompt = "";
        public bool HasImage;
    }
}
