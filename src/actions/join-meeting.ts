import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { execFile as execFile_async } from "node:child_process";
import appleScript from "../calendar.jxa.js";
import { promisify } from "node:util";
import wrap from "word-wrap";
const execFile = promisify(execFile_async);

const logger = streamDeck.logger.createScope("nextmeeting");

interface Interview {
	name: string;
	position: string;
	link: string;
	scorecard: string;
	guide: string;
}

interface Event {
	title: string;
	location: string;
	start: Date;
	end: Date;

	interview: Interview;
	start_relative: string;
	meeting_link: string;
}

const noNext = "No next\nmeeting";
enum State {
	Active = 0,
	Inactive,
};

const dataToEvent = (data: any): Event => ({
	title: data.title,
	location: data.location,
	start: data.startDate,
	end: data.endDate,
	start_relative: data.start_relative,
	meeting_link: data.meeting_link,
	interview: data.interview,
});

/**
 * An action that maintains a background state of the next upcoming meeting, and joins said meeting
 * upon button press.
 */
@action({ UUID: "com.bernardo-farah.next-zoom-meeting.join" })
export class JoinMeeting extends SingletonAction<NextMeetingSettings> {
	_interval?: ReturnType<typeof setInterval>
	_event?: Event;
	/**
	 * The {@link SingletonAction.onWillAppear} sets up the interval at which we poll for a new
	 * meeting (every 10 seconds) and continuously updates the title of the card in the case of an
	 * upcoming meeting.
	 */
	onWillAppear(ev: WillAppearEvent<NextMeetingSettings>): void | Promise<void> {
		this._interval = setInterval(() => {
			// We can move the go logic here so we don't have to run a server
			execFile("/usr/bin/env", ["osascript", "-l", "JavaScript", appleScript]).then(({ stdout }) => {
				try {
					return JSON.parse(stdout);
				} catch (e) {
					logger.debug("Failed to parse calendar output: ", stdout);
					return [];
				}
			}).then((data) => {
				if (!Array.isArray(data) || data.length < 1) {
					throw new Error("No new meeting");
				}

				let events = data.map(dataToEvent);

				// If we have multiple events, prefer those with a meeting link
				const withLinks = events.filter((e) => !!e.meeting_link);
				if (events.length > 1 && withLinks.length > 0) {
					events = withLinks;
				}

				logger.info("events:"+events.map((i) => i.title).join(", "));

				// Default to the first event
				this._event = events[0];

				let title = ""
				if (this._event.interview?.name) {
					title = [this._event.interview.name, this._event.interview.position, this._event.start_relative].filter((part) => part !== "").join("\n");
				} else {
					const truncated = this._event.title.length > 30
						? this._event.title.slice(0, 27) + "..."
						: this._event.title;
					title = `${wrap(truncated, {width: 12, trim: true})}\n${this._event.start_relative}`;
				}

				const state = this._event.meeting_link ? State.Active : State.Inactive;
				ev.action.setState(state).then(() => ev.action.setTitle(title));
			}).catch((err) => {
				logger.warn("Error with calendar: ",err);
				ev.action.setState(State.Inactive).then(() => ev.action.setTitle(noNext));
			});
		}, 10000);
	}

	onWillDisappear(ev: WillDisappearEvent<NextMeetingSettings>): void | Promise<void> {
		if (this._interval) clearInterval(this._interval);
		this._interval = undefined;
		this._event = undefined;
		ev.action.setState(State.Inactive);
	}

	/**
	 * Listens for the {@link SingletonAction.onKeyDown} opens the next meeting.
	 */
	async onKeyDown(ev: KeyDownEvent<NextMeetingSettings>): Promise<void> {
		if (this._event === undefined) return;

		const links = [this._event.meeting_link];

		if (this._event.interview) {
			links.unshift(
				this._event.interview.scorecard,
				this._event.interview.guide,
			)
		}

		// Open all links
		Promise.all(links.map((link) => execFile("open", [link]))).catch((e) => {
			logger.warn("Unable to open meeting:\n" + e);
		});
	}
}

/**
 * Settings for {@link JoinMeeting}.
 */
type NextMeetingSettings = {
	binaryPath: string;
};

