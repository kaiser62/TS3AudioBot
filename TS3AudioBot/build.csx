#r "nuget: SimpleExec, 6.2.0"
#r "nuget: Newtonsoft.Json, 12.0.3"

using Newtonsoft.Json;
using static SimpleExec.Command;

if (Args.Count == 0) {
	WriteLine("This script is itended to be used in the build pipeline");
	return 1;
}

string outFile = Args[0];
string buildConfig = Args[1];

string json = Read("dotnet", "gitversion");

var version = JsonConvert.DeserializeAnonymousType(json, new {
	FullSemVer = "",
	BranchName = "",
	Sha = "",

	AssemblySemVer = "",
	AssemblySemFileVer = "",
	InformationalVersion = "",
});

// CI sets TS3AB_VERSION (from the git tag) because GitVersion's guess differs between clones.
string fullSemVer = version.FullSemVer, assemblySemVer = version.AssemblySemVer,
	assemblySemFileVer = version.AssemblySemFileVer, informationalVersion = version.InformationalVersion;
var overrideVersion = Environment.GetEnvironmentVariable("TS3AB_VERSION");
if (!string.IsNullOrWhiteSpace(overrideVersion)) {
	var core = System.Text.RegularExpressions.Regex.Match(overrideVersion, @"^\d+\.\d+\.\d+").Value;
	if (core.Length == 0) {
		WriteLine("TS3AB_VERSION must start with major.minor.patch: {0}", overrideVersion);
		return 1;
	}
	fullSemVer = overrideVersion;
	assemblySemVer = core + ".0";
	assemblySemFileVer = core + ".0";
	informationalVersion = overrideVersion + "+Sha." + version.Sha;
}

var genFile = $@"
[assembly: System.Reflection.AssemblyVersion(""{assemblySemVer}"")]
[assembly: System.Reflection.AssemblyFileVersion(""{assemblySemFileVer}"")]
[assembly: System.Reflection.AssemblyInformationalVersion(""{informationalVersion}"")]

namespace TS3AudioBot.Environment
{{
	partial class BuildData {{
		partial void GetDataInternal() {{
			this.Version = ""{fullSemVer}"";
			this.Branch = ""{version.BranchName}"";
			this.CommitSha = ""{version.Sha}"";

			this.BuildConfiguration = ""{buildConfig}"";
		}}
	}}
}}
";

Console.WriteLine("Generated Version {0}", fullSemVer);
var writeFull = Path.GetFullPath(outFile);
//WriteLine("Writing to {0}", writeFull);
File.WriteAllText(writeFull, genFile);
