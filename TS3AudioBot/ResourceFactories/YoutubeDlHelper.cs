// TS3AudioBot - An advanced Musicbot for Teamspeak 3
// Copyright (C) 2017  TS3AudioBot contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the Open Software License v. 3.0
//
// You should have received a copy of the Open Software License along with this
// program. If not, see <https://opensource.org/licenses/OSL-3.0>.

using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Threading.Tasks;
using TS3AudioBot.Config;
using TS3AudioBot.Helper;
using TS3AudioBot.Localization;

namespace TS3AudioBot.ResourceFactories
{
	public static class YoutubeDlHelper
	{
		private static readonly NLog.Logger Log = NLog.LogManager.GetCurrentClassLogger();
		public static ConfPath? DataObj { private get; set; }
		private static string? YoutubeDlPath => DataObj?.Path.Value;

		private const string ParamGetSingleVideo = " --no-warnings --dump-json --id --";
		private const string ParamGetPlaylist = "--no-warnings --yes-playlist --flat-playlist --dump-single-json --id --";
		private const string ParamGetSearch = "--no-warnings --flat-playlist --dump-single-json -- ytsearch10:";

		public static async Task<JsonYtdlDump> GetSingleVideo(string id)
		{
			var ytdlPath = FindYoutubeDl();
			if (ytdlPath is null)
				throw Error.LocalStr(strings.error_ytdl_not_found);

			var param = $"{ytdlPath.Value.param}{ParamGetSingleVideo} {id}";
			return await RunYoutubeDl<JsonYtdlDump>(ytdlPath.Value.ytdlpath, param);
		}

		public static async Task<JsonYtdlPlaylistDump> GetPlaylistAsync(string url)
		{
			var ytdlPath = FindYoutubeDl();
			if (ytdlPath is null)
				throw Error.LocalStr(strings.error_ytdl_not_found);

			var param = $"{ytdlPath.Value.param}{ParamGetPlaylist} {url}";
			return await RunYoutubeDl<JsonYtdlPlaylistDump>(ytdlPath.Value.ytdlpath, param);
		}

		public static async Task<JsonYtdlPlaylistDump> GetSearchAsync(string text)
		{
			var ytdlPath = FindYoutubeDl();
			if (ytdlPath is null)
				throw Error.LocalStr(strings.error_ytdl_not_found);

			var param = $"{ytdlPath.Value.param}{ParamGetSearch}\"{text}\"";
			return await RunYoutubeDl<JsonYtdlPlaylistDump>(ytdlPath.Value.ytdlpath, param);
		}

		public static (string ytdlpath, string param)? FindYoutubeDl()
		{
			var youtubeDlPath = YoutubeDlPath;
			if (string.IsNullOrEmpty(youtubeDlPath))
			{
				// Default path youtube-dl is suggesting to install
				const string defaultYtDlPath = "/usr/local/bin/youtube-dl";
				if (File.Exists(defaultYtDlPath))
					return (defaultYtDlPath, "");

				// Default path most package managers install to
				const string defaultPkgManPath = "/usr/bin/youtube-dl";
				if (File.Exists(defaultPkgManPath))
					return (defaultPkgManPath, "");

				youtubeDlPath = Directory.GetCurrentDirectory();
			}

			string fullCustomPath;
			try { fullCustomPath = Path.GetFullPath(youtubeDlPath); }
			catch (ArgumentException ex)
			{
				Log.Warn(ex, "Your youtube-dl path may contain invalid characters");
				return null;
			}

			// Example: /home/teamspeak/youtube-dl where 'youtube-dl' is the binary
			if (File.Exists(fullCustomPath) || File.Exists(fullCustomPath + ".exe"))
				return (fullCustomPath, "");

			// Example: /home/teamspeak where the binary 'youtube-dl' lies in ./teamspeak/
			string fullCustomPathWithoutFile = Path.Combine(fullCustomPath, "youtube-dl");
			if (File.Exists(fullCustomPathWithoutFile) || File.Exists(fullCustomPathWithoutFile + ".exe"))
				return (fullCustomPathWithoutFile, "");

			// Example: /home/teamspeak/youtube-dl where 'youtube-dl' is the github project folder
			string fullCustomPathGhProject = Path.Combine(fullCustomPath, "youtube_dl", "__main__.py");
			if (File.Exists(fullCustomPathGhProject))
				return ("python", $"\"{fullCustomPathGhProject}\"");

			return null;
		}

		public static async Task<T> RunYoutubeDl<T>(string path, string args) where T : notnull
		{
			try
			{
				bool stdOutDone = false;
				var stdOut = new StringBuilder();
				var stdErr = new StringBuilder();

				using var tmproc = new Process();
				tmproc.StartInfo.FileName = path;
				tmproc.StartInfo.Arguments = args;
				tmproc.StartInfo.UseShellExecute = false;
				tmproc.StartInfo.CreateNoWindow = true;
				tmproc.StartInfo.RedirectStandardOutput = true;
				tmproc.StartInfo.RedirectStandardError = true;
				tmproc.EnableRaisingEvents = true;
				StepLog.Write($"yt-dlp: running {args.Trim()}");
				var runTime = Stopwatch.StartNew();
				tmproc.Start();
				tmproc.OutputDataReceived += (s, e) =>
				{
					if (e.Data is null)
						stdOutDone = true;
					else
						stdOut.Append(e.Data);
				};
				tmproc.ErrorDataReceived += (s, e) =>
				{
					if (e.Data is null)
						return;
					if (stdErr.Length > 0)
						stdErr.Append('\n');
					stdErr.Append(e.Data);
				};
				tmproc.BeginOutputReadLine();
				tmproc.BeginErrorReadLine();
				await tmproc.WaitForExitAsync(TimeSpan.FromSeconds(20));

				if (!tmproc.HasExitedSafe())
				{
					StepLog.Write($"yt-dlp: no answer after {runTime.ElapsedMilliseconds}ms, killing it (20s limit)");
					try { tmproc.Kill(); }
					catch (Exception ex) { Log.Debug(ex, "Failed to kill"); }
				}

				var timeout = Stopwatch.StartNew();
				while (!stdOutDone)
				{
					if (timeout.Elapsed >= TimeSpan.FromSeconds(5))
					{
						stdErr.Append(strings.error_ytdl_empty_response).Append(" (timeout)");
						break;
					}
					await Task.Delay(50);
				}

				if (stdErr.Length > 0)
				{
					var errorOutput = stdErr.ToString();
					Log.Debug("youtube-dl failed to load the resource:\n{0}", errorOutput);
					StepLog.Write($"yt-dlp: failed after {runTime.ElapsedMilliseconds}ms (exit {(tmproc.HasExitedSafe() ? tmproc.ExitCode.ToString() : "killed")}): {errorOutput}");
					throw Error.LocalStr(TransformYtdlError(errorOutput));
				}

				StepLog.Write($"yt-dlp: done in {runTime.ElapsedMilliseconds}ms ({stdOut.Length / 1024}KB of data)");
				return ParseResponse<T>(stdOut.ToString());
			}
			catch (Win32Exception ex)
			{
				Log.Error(ex, "Failed to run youtube-dl: {0}", ex.Message);
				StepLog.Write($"yt-dlp: could not be started ({path}): {ex.Message}");
				throw Error.Exception(ex).LocalStr(strings.error_ytdl_failed_to_run);
			}
		}

		public static T ParseResponse<T>(string? json) where T : notnull
		{
			if (string.IsNullOrEmpty(json))
				throw Error.LocalStr(strings.error_ytdl_empty_response);

			try
			{

				return JsonConvert.DeserializeObject<T>(json);
			}
			catch (Exception ex)
			{
				Log.Debug(ex, "Failed to read youtube-dl json data");
				throw Error.Exception(ex).LocalStr(strings.error_media_internal_invalid);
			}
		}

		/// <summary>Picks the best audio format. Order of preference:
		/// direct download over HLS manifest, audio-only over muxed video,
		/// codec (opus / AAC-LC first), audio bitrate, then the smallest video for muxed formats.</summary>
		public static JsonYtdlFormat? FilterBest(IEnumerable<JsonYtdlFormat>? formats)
		{
			Log.Debug("Picking from options: {@formats}", formats);

			if (formats is null)
				return null;

			var best = formats
				.Where(f => f.acodec != "none" && !string.IsNullOrEmpty(f.url))
				.OrderBy(f => IsHls(f))
				.ThenByDescending(f => IsAudioOnly(f))
				.ThenByDescending(f => CodecRank(f.acodec))
				.ThenByDescending(f => f.abr ?? (IsAudioOnly(f) ? f.tbr : null) ?? 0)
				.ThenBy(f => (f.width ?? 0) * (f.height ?? 0))
				.FirstOrDefault();

			Log.Debug("Picked: {@format}", best);
			return best;
		}

		public static bool IsAudioOnly(JsonYtdlFormat format) => format.vcodec == "none";

		public static bool IsHls(JsonYtdlFormat format)
			=> (format.protocol?.StartsWith("m3u8") ?? false)
			|| (format.url != null && (format.url.Contains(".m3u8") || format.url.Contains("manifest.googlevideo.com")));

		private static int CodecRank(string? acodec)
		{
			if (acodec is null) return 0;
			if (acodec.StartsWith("opus") || acodec.StartsWith("mp4a.40.2")) return 3;
			if (acodec.StartsWith("mp4a.40.5")) return 2; // HE-AAC, low bitrate
			return 1;
		}

		/// <summary>Turns raw yt-dlp stderr into a short message a user can act on.</summary>
		public static string TransformYtdlError(string errorOutput)
		{
			var err = errorOutput.ToLowerInvariant();
			bool Has(params string[] patterns) => patterns.Any(p => err.Contains(p));

			if (Has("not a bot"))
				return "YouTube blocked the request with a bot check. Refresh cookies.txt or try again later.";
			if (Has("confirm your age", "age-restricted", "age restricted", "inappropriate for some users"))
				return "Video is age-restricted. It needs a cookies.txt from a logged-in account.";
			if (Has("private video", "video is private"))
				return "Video is private.";
			if (Has("members-only", "join this channel"))
				return "Video is members-only.";
			if (Has("not available in your country", "geo restrict", "geo-restrict"))
				return "Video is not available in the server's region.";
			if (Has("premieres in", "live event will begin", "this live event"))
				return "Video is a premiere or live event that has not started yet.";
			if (Has("video unavailable", "has been removed", "this video is not available", "copyright claim", "account associated with this video has been terminated"))
				return "Video is unavailable (removed or blocked).";
			if (Has("http error 429", "too many requests"))
				return "YouTube is rate-limiting this server (HTTP 429). Try again later.";
			if (Has("http error 403"))
				return "YouTube refused the request (HTTP 403). Try again; if it keeps happening yt-dlp may need an update.";
			if (Has("no video formats", "requested format is not available", "no formats found"))
				return "No playable formats found for this video.";
			if (Has("cannot connect to the docker daemon", "unable to find image", "docker: "))
				return "yt-dlp container could not be started (Docker error).";
			if (Has("timed out", "timeout"))
				return "yt-dlp timed out talking to YouTube. Try again.";
			if (Has("network is unreachable", "name resolution", "temporary failure in name", "connection refused", "connection reset", "urlopen error"))
				return "Network error while contacting YouTube. Try again.";

			var errorLine = errorOutput.Split('\n').Select(l => l.Trim()).FirstOrDefault(l => l.StartsWith("ERROR:"));
			if (errorLine is null)
				return strings.error_ytdl_song_failed_to_load;
			errorLine = Regex.Replace(errorLine, @"^ERROR:\s*(\[[^\]]+\]\s*)?([\w-]{11}:\s*)?", "");
			if (errorLine.Length > 200)
				errorLine = errorLine.Substring(0, 200) + "...";
			return $"yt-dlp: {errorLine}";
		}

		public static SongInfo MapToSongInfo(JsonYtdlDump dump)
		{
			return new SongInfo
			{
				Title = dump.title,
				Track = dump.track,
				Artist = dump.artist,
				Length = TimeSpan.FromSeconds(dump.duration)
			};
		}

		// https://stackoverflow.com/a/50461641/2444047
		/// <summary>
		/// Waits asynchronously for the process to exit.
		/// </summary>
		/// <param name="process">The process to wait for cancellation.</param>
		/// <param name="timeout">The maximum time to wait for exit before returning anyway.</param>
		/// <param name="cancellationToken">A cancellation token. If invoked, the task will return
		/// immediately as canceled.</param>
		/// <returns>A Task representing waiting for the process to end.</returns>
		public static async Task WaitForExitAsync(this Process process, TimeSpan timeout, CancellationToken cancellationToken = default)
		{
			var tcs = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);

			void Process_Exited(object? sender, EventArgs e)
			{
				tcs.TrySetResult(true);
			}

			process.EnableRaisingEvents = true;
			process.Exited += Process_Exited;

			try
			{
				if (process.HasExited)
				{
					return;
				}

				var timoutTask = Task.Delay(timeout, cancellationToken);

				using (cancellationToken.Register(() => tcs.TrySetCanceled()))
				{
					await Task.WhenAny(tcs.Task, timoutTask);
				}
			}
			finally
			{
				process.Exited -= Process_Exited;
			}
		}
	}

#pragma warning disable CS0649, CS0169, IDE1006
	public abstract class JsonYtdlBase
	{
		public string? extractor { get; set; }
		public string? extractor_key { get; set; }
	}

	public class JsonYtdlDump : JsonYtdlBase
	{
		public string? title { get; set; }
		public string? track { get; set; }
		public string? artist { get; set; }
		// TODO int -> timespan converter
		public float duration { get; set; }
		public string? id { get; set; }
		public JsonYtdlFormat[]? formats { get; set; }
		public JsonYtdlFormat[]? requested_formats { get; set; }

		public string? AutoTitle => track ?? title;
	}

	public class JsonYtdlFormat
	{
		public string? vcodec { get; set; }
		public string? acodec { get; set; }
		/// <summary>audioBitRate</summary>
		public float? abr { get; set; }
		/// <summary>audioSampleRate</summary>
		public float? asr { get; set; }
		/// <summary>totalBitRate</summary>
		public float? tbr { get; set; }
		//public object http_headers { get; set; }
		public string? format { get; set; }
		public string? format_id { get; set; }
		public string? url { get; set; }
		public string? ext { get; set; }
		public string? protocol { get; set; }
		public int? width { get; set; }
		public int? height { get; set; }
	}

	public class JsonYtdlPlaylistDump : JsonYtdlBase
	{
		public string? id { get; set; }
		public string? title { get; set; }
		public JsonYtdlPlaylistEntry[]? entries { get; set; }
	}

	public class JsonYtdlPlaylistEntry
	{
		public string? title { get; set; }
		public string? id { get; set; }
	}
#pragma warning restore CS0649, CS0169, IDE1006
}
