using System.IO;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
using Microsoft.Web.WebView2.Core;
// For Mutate(). Every ImageSharp TYPE stays fully qualified below, because
// System.Windows brings its own ResizeMode and Size into scope and an unqualified
// one here would be ambiguous rather than wrong-and-obvious.
using SixLabors.ImageSharp.Processing;

namespace JubileeCoverArtStudio;

// ============================================================================
//  THE BROWSER DRIVER
// ============================================================================
//
// Everything that touches the ChatGPT web UI. Ported UNCHANGED from
// wpf/MainWindow.xaml.cs (JubileePraise Studio), which got it from
// InspireManna.com/tools/ArticleImageStudio.
//
// 🔴 THE COMMENTS IN THIS FILE ARE THE MOST VALUABLE THING IN IT. Almost every
// delay, every read-back and every "check it twice" below is a measured fix for a
// failure that actually happened — a turn sent with the attachment and no prompt,
// a six-minute wait on a turn that died in the first ten seconds, a piece
// illustrated with its own reference portrait. Do not tidy them away, and do not
// remove a wait because it looks like padding.
//
// If ChatGPT changes its layout, this file is where it breaks and this file is
// where it is fixed. The selectors are deliberately loose and fail OPEN: a
// missing attribute makes a filter stop matching rather than match nothing.

public partial class MainWindow
{
    /// <summary>
    /// The outcome of a single submit-and-wait.
    ///
    /// PageFailed means ChatGPT itself died on this turn, which a fresh
    /// conversation can fix. PolicyRefused means the content filter rejected the
    /// PROMPT, which a fresh conversation cannot fix and only a rewritten prompt
    /// can. The two used to be one flag and the run wasted whole minutes retrying
    /// prompts that were never going to be accepted.
    /// </summary>
    private readonly record struct Attempt(string? Src, bool PageFailed, bool PolicyRefused);

    /// <summary>
    /// One submit-and-wait: open or continue a conversation, attach whatever this
    /// job carries, type the prompt, confirm it landed, press send, confirm THAT
    /// landed, then watch for the picture.
    /// </summary>
    private async Task<Attempt> AttemptOne(Job job, bool newThread, string promptText, CancellationToken ct)
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
        if (!await WaitForComposer(ct))
        {
            Log("  ✗ Chat box never appeared — are you logged in? (composer not found)");
            return new Attempt(null, false, false);
        }

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

        // References go on BEFORE the baseline is taken, because an attachment
        // thumbnail is itself an image on the page and would otherwise read as the
        // generated result. They also go on before the prompt is typed: ProseMirror
        // keeps its text across an attach, but the reverse order has the upload
        // racing the send.
        var refs = ReferencesFor(job);
        if (refs.Count > 0)
        {
            bool first = true;
            int on = 0;
            foreach (var r in refs)
            {
                var b64 = ReferenceBase64(r);
                if (b64 == null) continue;
                if (!await AttachReference(b64, Path.GetFileName(r), ct, clearFirst: first))
                {
                    Log("  ✗ A reference could not be attached, so nothing was sent. This job stays queued.");
                    return new Attempt(null, false, false);
                }
                first = false;
                on++;
            }
            if (on == 0 && job.Kind == Kind.Cover)
            {
                // A cover with no reference is not worth generating: the whole
                // point is that it sits beside this persona's released covers as
                // an obvious sibling.
                Log("  ✗ No usable reference for this cover. Nothing was sent.");
                return new Attempt(null, false, false);
            }
            if (on > 0)
                Log($"  Reference: {on} image(s) — {string.Join(", ", refs.Select(Path.GetFileNameWithoutExtension))}.");
        }
        else
        {
            // Nothing to attach, and the composer may still be holding what the
            // previous turn pinned to it. Left there, the last cover's style
            // references would silently ride along with a free generation.
            await Wv.CoreWebView2.ExecuteScriptAsync(ClearAttachmentsScript());
            await Task.Delay(300, ct);
        }

        // NOTHING IS TYPED INTO A STREAMING COMPOSER. While ChatGPT is mid-turn its
        // send button IS the stop button, so a submit into that window cannot land:
        // the click finds no send button and the synthetic Enter is ignored. The
        // prompt then sits in the box, unsent, while the run waits out a six-minute
        // deadline for an image that was never requested. That is the hang.
        if (!await WaitUntilComposerIdle(TimeSpan.FromSeconds(90), ct))
        {
            Log("  ✗ This conversation has been streaming for 90s with nothing to show — it is wedged.");
            // PageFailed, so the caller retries this job in a BRAND NEW thread
            // rather than typing into the same stuck one again.
            return new Attempt(null, true, false);
        }

        // Remember which images are already on the page so we only accept a NEW one.
        var baseline = new HashSet<string>(await GetImageList());
        Log($"  Sending prompt… ({baseline.Count} image(s) already on the page)");

        // Flatten to a single line before sending. The composer treats a newline as
        // a paragraph break and only the last paragraph survives, so any multi-line
        // prompt would arrive truncated — which is not hypothetical: the Image
        // Studio's prompt box accepts Return.
        var oneLine = Regex.Replace(promptText, @"\s+", " ").Trim();
        // Prompts end on their own trailing clause, so without this the shape
        // suffix would run straight on from it. Cheap to close the sentence first.
        if (oneLine.Length > 0 && !".!?".Contains(oneLine[^1])) oneLine += ".";

        var full = oneLine + SuffixFor(job);

        var submit = Json(await Wv.CoreWebView2.ExecuteScriptAsync(SubmitScript(full)));
        Log($"  typed: {submit}");
        if (submit == "no-composer") { Log("  ✗ Could not find the chat box to type into."); return new Attempt(null, false, false); }
        if (submit.StartsWith("mismatch", StringComparison.Ordinal))
        {
            // Nothing was sent. Sending a fragment is worse than sending nothing:
            // it burns a turn and produces an image for the wrong description.
            Log("  ✗ The composer did not receive the full prompt, so nothing was sent.");
            return new Attempt(null, false, false);
        }

        // LET REACT CATCH UP BEFORE PRESSING SEND. See SubmitScript: the text is in
        // the DOM the instant execCommand runs, but the composer is React-controlled
        // and does not hold it until the input event has been processed on a later
        // tick. Sending inside that gap submits an EMPTY message with the attachment
        // still on it, and ChatGPT answers by asking what it is supposed to do with
        // the picture instead of generating anything.
        await Task.Delay(700, ct);

        var click = Json(await Wv.CoreWebView2.ExecuteScriptAsync(ClickSendScript()));
        Log($"  send: {click}");
        if (click == "busy" || click == "disabled")
        {
            Log("  ✗ The send button was not available (the page was still busy). Nothing was sent.");
            return new Attempt(null, true, false);
        }
        if (click == "no-composer") { Log("  ✗ The chat box went away before the prompt could be sent."); return new Attempt(null, true, false); }

        // THE SEND IS VERIFIED, NOT ASSUMED. A click on a button that is present
        // but inert leaves the prompt sitting in the composer; the only reliable
        // proof the turn actually went is the box emptying. Without this the run
        // proceeds to wait six minutes on a turn that never left the machine.
        var landed = false;
        for (int i = 0; i < 8; i++)
        {
            await Task.Delay(700, ct);
            if (int.TryParse(Json(await Wv.CoreWebView2.ExecuteScriptAsync(ComposerLengthScript())), out var len) && len < 5)
            { landed = true; break; }
        }
        if (!landed)
        {
            Log("  ✗ The prompt is still sitting in the composer — the send did not go through.");
            return new Attempt(null, true, false);
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

    /// <summary>
    /// The aspect-ratio and no-lettering clause, appended last.
    ///
    /// LAST, and on ONE LINE. The last instruction in a turn is the one the web UI
    /// honours most reliably, and a newline anywhere in the prompt truncates it —
    /// the composer treats it as a paragraph break and keeps only the final
    /// paragraph.
    /// </summary>
    private string SuffixFor(Job job)
    {
        // The wardrobe and proportions reminder rides in the last clause of the
        // turn for covers and heroes both — that is the position the web UI honours
        // most reliably, and those are the failures the complaints were about.
        if (job.Kind == Kind.Cover) return CoverSuffix + SuffixWardrobeReminder(FirstNameOf(job)) + GenerateNowClause;
        // A hero's ratio is not a user choice — the whole point of the view is the
        // 16:9 conversion — and its no-lettering clause has to be louder than the
        // studio's, because unlike a studio job its reference is covered in text.
        if (job.Kind == Kind.Hero) return HeroSuffix + SuffixWardrobeReminder(FirstNameOf(job)) + GenerateNowClause;

        var shape = (CmbShape?.SelectedItem as System.Windows.Controls.ComboBoxItem)?.Tag as string ?? "";
        var ratio = shape.Length == 0
            ? ""
            : $" IMPORTANT: produce this image in a {shape} aspect ratio, exactly. ";

        return ratio +
            " GENERATE THE IMAGE NOW. Do not reply with text, do not ask what to do with any attachment, " +
            "do not offer options or ask which one is wanted, and do not describe what you could make. " +
            "Return the finished picture.";
    }

    /// <summary>Which reference images a job carries, if any.</summary>
    private List<string> ReferencesFor(Job job) => job.Kind switch
    {
        Kind.Cover => CoverReferencesFor(job),
        // Exactly one: the album's OWN cover. A hero is a reverse-engineering of
        // that specific picture, so a spread of the persona's other covers — which
        // is right for a cover job — would pull it away from the album it belongs to.
        Kind.Hero => HeroReferencesFor(job),
        _ => job.References,
    };

    /// <summary>
    /// A reference image, cropped and downscaled, as base64 JPEG.
    ///
    /// 768px and quality 88, which is enough for a likeness and a palette and is
    /// a fraction of the upload a 4 MB master would be. Cached by path, because a
    /// sweep of one persona attaches the same three covers to eighty turns.
    /// </summary>
    private string? ReferenceBase64(string path)
    {
        if (_referenceCache.TryGetValue(path, out var hit)) return hit;
        try
        {
            using var image = SixLabors.ImageSharp.Image.Load(File.ReadAllBytes(path));

            // A COVER reference is cropped to its centre 80%, which removes most of
            // the wordmark up the left edge and the title along the bottom. Handing
            // the model a picture with lettering baked into it and then asking for
            // no lettering is a fight worth avoiding; cropping it out is cheaper
            // than arguing with it, and the prompt still says so in case a corner
            // survives.
            //
            // A STUDIO reference is NOT cropped. The user picked that file, and
            // trimming a fifth off it without saying so would be the app quietly
            // discarding part of what it was given.
            if (_croppedRefs.Contains(path))
            {
                var w = (int)(image.Width * 0.80);
                var h = (int)(image.Height * 0.80);
                image.Mutate(x => x.Crop(new SixLabors.ImageSharp.Rectangle(
                    (image.Width - w) / 2, (image.Height - h) / 2, w, h)));
            }

            image.Mutate(x => x.Resize(new SixLabors.ImageSharp.Processing.ResizeOptions
            {
                Mode = SixLabors.ImageSharp.Processing.ResizeMode.Max,
                Size = new SixLabors.ImageSharp.Size(768, 768),
            }));
            using var ms = new MemoryStream();
            image.Save(ms, new SixLabors.ImageSharp.Formats.Jpeg.JpegEncoder { Quality = 88 });
            var b64 = Convert.ToBase64String(ms.ToArray());
            _referenceCache[path] = b64;
            return b64;
        }
        catch (Exception ex)
        {
            Log($"  ⚠ Could not read the reference {Path.GetFileName(path)}: {ex.Message}");
            return null;
        }
    }

    /// <summary>Paths that should be centre-cropped before being sent — album covers.</summary>
    private readonly HashSet<string> _croppedRefs = new(StringComparer.OrdinalIgnoreCase);

    /// <summary>
    /// Attach one image to the composer and wait until the page has really taken
    /// it.
    ///
    /// Returns false rather than pressing on. Sending the turn with no reference
    /// attached would produce a perfectly good image of the wrong thing and then
    /// mark it done, so it would never be regenerated. A skipped job is
    /// recoverable; a silently reference-less one that reports success is not.
    /// </summary>
    /// <param name="clearFirst">
    /// False to ADD to what is already attached. A cover sends three existing
    /// covers as a style reference, and those have to accumulate on the same turn.
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
            Log("  ✗ Could not hand " + fileName + " to the page (" + (how.Length > 0 ? how : "no result") + ").");
            return false;
        }

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
                    Log("  ✗ The page never showed the attached image.");
                    return false;
                }
            }
            await Task.Delay(1000, ct);
        }
        Log("  ✗ The attachment was still uploading after 60s.");
        return false;
    }

    // ========================================================================
    //  WAITING FOR THE PICTURE
    // ========================================================================

    /// <summary>
    /// Waits for a generated image that (a) was not already present before we
    /// submitted, and (b) holds the same URL across two consecutive polls — i.e.
    /// generation has settled, not a streaming/placeholder frame.
    ///
    /// It also watches for ChatGPT's own failure state. When a turn dies with
    /// "Something went wrong. Please try again." no image is ever coming, and the
    /// old code could not tell that apart from a slow render: it sat out the full
    /// six-minute deadline on a turn that had already failed, then reported a
    /// generic timeout.
    ///
    /// The failure is now detected within a poll and retried on the page's own
    /// Retry button with a BACKOFF. That matters more than the retry count does.
    /// "Something went wrong" is overwhelmingly a capacity or rate signal, and
    /// answering it by pressing Retry six seconds later is well inside the window
    /// that produced the error in the first place. Backing off 20s, then 45s, then
    /// 90s costs at most two and a half minutes on a genuinely dead turn and
    /// rescues most of the transient ones.
    /// </summary>
    private async Task<(string? Src, bool PageFailed, bool PolicyRefused)> WaitForNewImage(
        HashSet<string> baseline, CancellationToken ct)
    {
        // The deadline is extended per retry, so a slow-but-alive turn is not
        // killed by time spent deliberately waiting out a backoff.
        var deadline = DateTime.UtcNow.AddMinutes(6);
        int[] backoff = { 20000, 45000, 90000 };
        string? last = null;
        int stable = 0, polls = 0, retries = 0;

        // ---- the stall watchdog ------------------------------------------------
        //
        // TWO MINUTES WITH THE PAGE COMPLETELY STATIC MEANS THE THREAD IS DEAD, and
        // the run should move to a fresh conversation rather than sit out the rest
        // of the six-minute deadline. It is the difference between one wasted turn
        // and eighteen minutes of apparent hang: on a failure the caller keeps the
        // same thread, so a wedged conversation used to take the next two jobs down
        // with it before the run gave up.
        //
        // "STATIC" IS MEASURED, NOT GUESSED, and it is deliberately NOT "the stop
        // button is missing". A wedged conversation can sit there with its stop
        // button showing and nothing behind it — that is exactly the state this was
        // reported in. So the probe fingerprints the things that MOVE when work is
        // really happening (large-image count, the length of the last assistant
        // message, the stream flag) and the clock resets the moment any of them
        // changes. A genuinely slow render is streaming text or growing an image
        // and keeps its full six minutes; only a frozen page is cut short.
        var stallLimit = TimeSpan.FromMinutes(2);
        var lastProgress = DateTime.UtcNow;
        var fingerprint = "";

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
                    // The backoff was time spent deliberately NOT polling, so it is
                    // not evidence of a stall. Without this reset a 90s backoff
                    // would hand the retry only thirty seconds of watchdog before it
                    // was declared wedged — punishing the recovery for the wait it
                    // was told to take.
                    lastProgress = DateTime.UtcNow;
                    continue;
                }
                Log($"    ✗ ChatGPT failed this turn {backoff.Length + 1} times, backing off each time.");
                return (null, true, false);
            }

            var probe = Json(await Wv.CoreWebView2.ExecuteScriptAsync(ProgressProbeScript()));
            if (probe != fingerprint) { fingerprint = probe; lastProgress = DateTime.UtcNow; }
            else if (DateTime.UtcNow - lastProgress > stallLimit)
            {
                Log($"    ✗ Nothing on the page has changed for {stallLimit.TotalMinutes:0} minutes — this conversation is wedged.");
                Log("      Abandoning it and starting a fresh thread for this image.");
                return (null, true, false);   // PageFailed → the caller opens a new conversation
            }

            if (++polls % 5 == 0)
            {
                var idle = (int)(DateTime.UtcNow - lastProgress).TotalSeconds;
                Log($"    …still waiting ({current.Count} image(s) on page, ~{(int)(deadline - DateTime.UtcNow).TotalSeconds}s left" +
                    (idle >= 20 ? $", no page activity for {idle}s" : "") + ")");
            }
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

    // ========================================================================
    //  SAVING
    // ========================================================================

    /// <summary>
    /// Fetch the image bytes INSIDE the page — which is what keeps the auth
    /// session; a plain HttpClient gets a 403 from the signed URL — receive them
    /// over a web message, convert, and write the file the job names.
    /// </summary>
    private async Task<bool> SaveImage(string src, Job job, CancellationToken ct)
    {
        _imageMsg = new TaskCompletionSource<string>();
        await Wv.CoreWebView2.ExecuteScriptAsync(FetchScript(src));
        var b64 = await WaitForMessage(TimeSpan.FromSeconds(60), ct);
        if (b64 == null) { Log("  Failed to download the image bytes."); return false; }

        try
        {
            var original = Convert.FromBase64String(b64);
            var dir = Path.GetDirectoryName(job.OutFile)!;
            Directory.CreateDirectory(dir);

            byte[] bytes;
            string dest = job.OutFile;

            if (job.Kind == Kind.Cover)
            {
                // A cover stays PNG. Every master on the music drive is PNG, and
                // the publish pipeline is what converts covers to WebP for the
                // CDN — doing it here would hand that step a lossy source and
                // leave the archive holding the worse copy of its own artwork.
                bytes = ApplyChrome(original, job, out var chromeNote);
                if (chromeNote.Length > 0) Log("  " + chromeNote);
            }
            else if (job.Webp)
            {
                // Convert as soon as it lands. ChatGPT hands back multi-megabyte
                // PNG/JPEG; WebP is a fraction of that for the same picture.
                (bytes, var ext) = ToWebp(original, out var note);
                dest = Path.ChangeExtension(job.OutFile, ext);
                if (note.Length > 0) Log("  " + note);
            }
            else
            {
                // The extension is SNIFFED, never taken from the URL: ChatGPT
                // serves these from blob/CDN paths that carry no format, and a
                // .png holding JPEG bytes is a file half this repo's tooling will
                // refuse to open.
                bytes = original;
                dest = Path.ChangeExtension(job.OutFile, SniffExtension(original));
            }

            await File.WriteAllBytesAsync(dest, bytes, ct);
            job.OutFile = dest;

            var saved = original.Length > 0 ? 100 - (int)(bytes.LongLength * 100 / original.LongLength) : 0;
            Log($"  Saved {dest}  ({bytes.Length:N0} bytes"
                + (bytes.Length < original.Length ? $", {saved}% smaller than the {original.Length:N0} byte original)" : ")"));

            if (job.Kind == Kind.Cover)
            {
                // NOT marked as having artwork: the album has a candidate awaiting
                // approval, which is a different thing. Setting ImageFile here
                // would claim the album is covered on the music drive, and the next
                // scan would disagree with disk.
                job.AwaitingReview = true;
                Log("  Cover: written to review/ for approval. NOT on the music drive.");
            }
            return true;
        }
        catch (Exception ex)
        {
            Log("  ✗ Could not save the image: " + ex.Message);
            return false;
        }
    }

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
    /// problem would cost a GPU render, so the original always wins over nothing.
    /// </summary>
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

    // ========================================================================
    //  NAVIGATION AND MESSAGING
    // ========================================================================

    /// <summary>
    /// Best-effort navigation: waits for the "completed" event but never hangs on
    /// it — after the timeout it proceeds, and WaitForComposer confirms the page is
    /// actually usable.
    /// </summary>
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

    /// <summary>
    /// Wait until the page has stopped streaming, so the prompt is not typed into
    /// a composer whose send button is currently a STOP button.
    /// </summary>
    /// <returns>false if it never went idle — the conversation is wedged.</returns>
    private async Task<bool> WaitUntilComposerIdle(TimeSpan limit, CancellationToken ct)
    {
        var until = DateTime.UtcNow + limit;
        var told = false;
        while (DateTime.UtcNow < until)
        {
            ct.ThrowIfCancellationRequested();
            if (Json(await Wv.CoreWebView2.ExecuteScriptAsync(ComposerBusyScript())) != "busy") return true;
            if (!told)
            {
                Log("  The previous turn is still streaming — waiting for it to finish before typing…");
                told = true;
            }
            await Task.Delay(2000, ct);
        }
        return false;
    }

    // ========================================================================
    //  THE INJECTED SCRIPTS
    // ========================================================================

    private static string J(string s) => JsonSerializer.Serialize(s);

    /// <summary>ExecuteScriptAsync returns a JSON-encoded value; decode string results.</summary>
    private static string Json(string result)
    {
        try { return JsonSerializer.Deserialize<string>(result) ?? ""; }
        catch { return ""; }
    }

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

    // Types the prompt into the composer, but only after reading the composer back
    // and confirming it actually holds what we meant to send.
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
        // TYPING ONLY. THE CLICK IS A SEPARATE CALL, AND THE GAP BETWEEN THEM IS
        // LOAD-BEARING.
        //
        // The original code clicked inside a setTimeout(…, 450). That delay looked
        // like defensive padding and it is not: execCommand puts the text in the
        // DOM immediately, but the composer is a React-controlled ProseMirror and
        // React has not committed that content to its own state until it has
        // processed the input event on a later tick. Clicking send in the SAME tick
        // submits what React still believes the composer holds, which is nothing —
        // so the turn goes with the ATTACHMENT ONLY and no instruction, and ChatGPT
        // replies "I can see the cover clearly, tell me what you want me to do with
        // it". Measured: three consecutive albums failed that way.
        //
        // The read-back check above cannot catch it. It reads innerText, which is
        // the DOM, and the DOM is correct — it is React that is behind.
        //
        // So the wait lives in C#, in the caller, where its result can actually be
        // inspected.
        "return 'typed|'+got.length;})();";

    /// <summary>
    /// Press send, once the composer has had time to settle.
    ///
    /// Reports what it actually did — never that it "submitted" when it only
    /// scheduled something. Enter stays as the fallback for a layout with no send
    /// button, as it always was.
    /// </summary>
    private static string ClickSendScript() =>
        "(function(){" +
        "if(document.querySelector('button[data-testid=stop-button]'))return 'busy';" +
        "var box=document.querySelector('#prompt-textarea')||document.querySelector('div[contenteditable=true]');" +
        "var btn=document.querySelector('button[data-testid=send-button]');" +
        "if(btn&&!btn.disabled){btn.click();return 'clicked';}" +
        "if(btn&&btn.disabled)return 'disabled';" +
        "if(box){box.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true}));return 'enter';}" +
        "return 'no-composer';})();";

    // ---- is the page busy, did the send land, is anything moving? ----------
    //
    // Three cheap probes that between them tell a WEDGED conversation apart from
    // a slow one. Every CSS attribute value below is left UNQUOTED, which is legal
    // for identifier-shaped values and keeps these strings free of escapes.

    /// <summary>'busy' while ChatGPT is streaming a turn, 'idle' otherwise.</summary>
    private static string ComposerBusyScript() =>
        "(function(){if(document.querySelector('button[data-testid=stop-button]'))return 'busy';" +
        "var bs=document.querySelectorAll('button');" +
        "for(var i=0;i<bs.length;i++){var a=(bs[i].getAttribute('aria-label')||'').toLowerCase();" +
        "if(a.indexOf('stop')===0)return 'busy';}return 'idle';})();";

    /// <summary>
    /// How many characters are sitting in the composer.
    ///
    /// The send is confirmed by this going to zero. A click that did nothing
    /// leaves the prompt in the box, which is the difference between "sent and
    /// rendering" and "never sent" — and the old code could not see it.
    /// </summary>
    private static string ComposerLengthScript() =>
        "(function(){var box=document.querySelector('#prompt-textarea')||" +
        "document.querySelector('div[contenteditable=true]');" +
        "if(!box)return '0';return String((box.innerText||box.textContent||'').trim().length);})();";

    /// <summary>
    /// A cheap fingerprint of everything that would change if the page were alive:
    /// how many large images are loaded, how long the last assistant message is,
    /// and whether it is streaming.
    ///
    /// THE STREAM FLAG IS NOT ENOUGH ON ITS OWN, which is the whole reason this
    /// returns three values. A wedged conversation can sit with its stop button
    /// showing and nothing behind it, so "is it streaming" reports alive while
    /// nothing moves. An unchanged fingerprint is the honest signal.
    /// </summary>
    private static string ProgressProbeScript() =>
        "(function(){var n=0;var imgs=document.querySelectorAll('img');" +
        "for(var i=0;i<imgs.length;i++){var im=imgs[i];" +
        "if(im.complete&&(im.naturalWidth||0)>=400&&(im.naturalHeight||0)>=400)n++;}" +
        "var t=document.querySelectorAll('[data-message-author-role=assistant]');" +
        "var L=t.length?(t[t.length-1].innerText||'').length:0;" +
        "var s=document.querySelector('button[data-testid=stop-button]')?1:0;" +
        "return n+'|'+L+'|'+s;})();";

    // Returns every finished, LARGE image on the page, in DOM order (last = most
    // recent). We detect by size rather than URL: ChatGPT serves generated images
    // from signed URLs that don't match any fixed pattern, but the generated image
    // is always the big, fully-loaded one — UI chrome (avatars, icons, inline
    // SVGs) is small and gets filtered out by the size gate.
    //
    // USER TURNS AND THE COMPOSER ARE EXCLUDED, and that exclusion is load-bearing
    // now that every turn can carry attached references. A reference is a 768px
    // raster, so it clears the size gate comfortably; once the turn is sent it
    // renders again inside the user's own message bubble under a fresh URL that is
    // not in the baseline. Without this filter it would be the newest unseen image
    // on the page for as long as the generated one took to render, hold still
    // across two polls, and be saved as the result — an album illustrated with a
    // shrunken copy of its own style reference.
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

    // Hands an image to the page as a real File.
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
    // all, which is the one wrong answer that costs a job its reference.
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

    // Fetches the finished image INSIDE the page, so the request carries the
    // logged-in session's cookies. The bytes come back over postMessage rather
    // than as a return value: ExecuteScriptAsync marshals a JSON string, and a
    // multi-megabyte base64 blob through that path is both slow and, past a
    // certain size, silently truncated.
    private static string FetchScript(string src) =>
        "(function(){var SRC=" + J(src) + ";" +
        "fetch(SRC).then(function(r){return r.arrayBuffer();}).then(function(buf){var b=new Uint8Array(buf);var bin='';var c=0x8000;" +
        "for(var i=0;i<b.length;i+=c){bin+=String.fromCharCode.apply(null,b.subarray(i,i+c));}" +
        "window.chrome.webview.postMessage(JSON.stringify({type:'image',b64:btoa(bin)}));})" +
        ".catch(function(e){window.chrome.webview.postMessage(JSON.stringify({type:'error',message:String(e)}));});return 'fetching';})();";
}
