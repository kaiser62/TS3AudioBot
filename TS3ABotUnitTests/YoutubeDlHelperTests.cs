using NUnit.Framework;
using TS3AudioBot.ResourceFactories;

namespace TS3ABotUnitTests
{
	[TestFixture]
	public class YoutubeDlHelperTests
	{
		private static JsonYtdlFormat F(string id, string acodec, string vcodec, float? abr, string protocol = "https", int? height = null)
			=> new JsonYtdlFormat
			{
				format_id = id,
				acodec = acodec,
				vcodec = vcodec,
				abr = abr,
				protocol = protocol,
				height = height,
				width = height * 16 / 9,
				url = protocol.StartsWith("m3u8") ? "https://manifest.googlevideo.com/x.m3u8" : "https://rr1.googlevideo.com/videoplayback?id=" + id,
			};

		[Test]
		public void FilterBest_PrefersAudioOnlyOpus()
		{
			var best = YoutubeDlHelper.FilterBest(new[]
			{
				F("18", "mp4a.40.2", "avc1.42001E", 96, height: 360),
				F("140", "mp4a.40.2", "none", 129),
				F("251", "opus", "none", 135),
				F("249", "opus", "none", 50),
				F("139", "mp4a.40.5", "none", 48),
				F("sb0", "none", "none", null),
			});
			Assert.AreEqual("251", best?.format_id);
		}

		[Test]
		public void FilterBest_PrefersDirectOverHls()
		{
			var best = YoutubeDlHelper.FilterBest(new[]
			{
				F("234", "mp4a.40.2", "none", 192, protocol: "m3u8_native"),
				F("140", "mp4a.40.2", "none", 129),
			});
			Assert.AreEqual("140", best?.format_id);
		}

		[Test]
		public void FilterBest_MuxedOnly_PicksSmallestVideo()
		{
			var best = YoutubeDlHelper.FilterBest(new[]
			{
				F("22", "mp4a.40.2", "avc1.64001F", 128, height: 720),
				F("18", "mp4a.40.2", "avc1.42001E", 128, height: 360),
				F("399", "none", "av01", null, height: 1080),
			});
			Assert.AreEqual("18", best?.format_id);
			Assert.IsFalse(YoutubeDlHelper.IsAudioOnly(best!));
		}

		[Test]
		public void FilterBest_NoAudio_ReturnsNull()
		{
			Assert.IsNull(YoutubeDlHelper.FilterBest(new[] { F("399", "none", "av01", null, height: 1080) }));
			Assert.IsNull(YoutubeDlHelper.FilterBest(null));
		}

		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm you're not a bot. Use --cookies", "bot check")]
		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Sign in to confirm your age. This video may be inappropriate for some users.", "age-restricted")]
		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Private video. Sign in if you've been granted access", "private")]
		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Video unavailable", "unavailable")]
		[TestCase("ERROR: unable to download video data: HTTP Error 429: Too Many Requests", "rate-limiting")]
		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Requested format is not available. Use --list-formats", "No playable formats")]
		[TestCase("docker: Cannot connect to the Docker daemon at unix:///var/run/docker.sock.", "Docker")]
		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Unable to download API page: <urlopen error [Errno 101] Network is unreachable>", "Network error")]
		[TestCase("ERROR: [youtube] dQw4w9WgXcQ: Something new and strange", "yt-dlp: Something new and strange")]
		public void TransformYtdlError_MapsKnownErrors(string stderr, string expected)
		{
			StringAssert.Contains(expected, YoutubeDlHelper.TransformYtdlError(stderr));
		}
	}
}
