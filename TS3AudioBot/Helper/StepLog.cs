// TS3AudioBot - An advanced Musicbot for Teamspeak 3
// Copyright (C) 2017  TS3AudioBot contributors
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the Open Software License v. 3.0
//
// You should have received a copy of the Open Software License along with this
// program. If not, see <https://opensource.org/licenses/OSL-3.0>.

using System;
using System.Threading;

namespace TS3AudioBot.Helper
{
	/// <summary>
	/// Carries a per-bot "step log" sink along the async call flow of a command.
	/// Code deep in the resolve/play pipeline (which has no reference to the bot)
	/// can call <see cref="Write"/> and the message lands in the channel of the
	/// bot which is currently executing the command.
	/// </summary>
	public static class StepLog
	{
		private static readonly NLog.Logger Log = NLog.LogManager.GetCurrentClassLogger();
		private static readonly AsyncLocal<Action<string>?> current = new AsyncLocal<Action<string>?>();

		/// <summary>Sets the sink for the current async flow until the returned scope is disposed.</summary>
		public static IDisposable Begin(Action<string> sink)
		{
			var previous = current.Value;
			current.Value = sink;
			return new Scope(previous);
		}

		/// <summary>Captures the sink of the current async flow, e.g. to pass it to another thread.</summary>
		public static Action<string>? Capture() => current.Value;

		public static void Write(string message)
		{
			var sink = current.Value;
			if (sink is null)
				return;
			try { sink(message); }
			catch (Exception ex) { Log.Debug(ex, "Step log sink failed"); }
		}

		private sealed class Scope : IDisposable
		{
			private readonly Action<string>? previous;
			public Scope(Action<string>? previous) { this.previous = previous; }
			public void Dispose() => current.Value = previous;
		}
	}
}
