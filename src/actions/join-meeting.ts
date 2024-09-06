import streamDeck, { action, KeyDownEvent, SingletonAction, WillAppearEvent, WillDisappearEvent } from "@elgato/streamdeck";
import { get } from "node:http";
import { exec as exec_async } from "node:child_process";
import appleScript from "../calendar.jxa.js";
import { promisify } from "node:util";
import wrap from "word-wrap";
const exec = promisify(exec_async);

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
	zoom_link: string;
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
	zoom_link: data.zoom_link,
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
			exec(`/usr/bin/env osascript -l JavaScript ${appleScript}`).then(({ stdout, stderr }) => {
				const json = JSON.parse(stdout);
				return json;
			}).then((data) => {
				if (!Array.isArray(data) || data.length < 1) {
					throw new Error("No new meeting");
				}

				let events = data.map(dataToEvent);

				// If we have multiple events, see if we have any with a zoom meeting
				if (events.length > 1 && events.find((e) => !!e.zoom_link && e.zoom_link !== "")) {
					events = events.filter((e) => !!e.zoom_link && e.zoom_link !== "");
				}

				// events = events.sort((a, b) => b.start.getTime() - a.start.getTime());

				logger.info("events:"+events.map((i) => i.title).join(", "));

				// Default to the first event
				this._event = events[0];

				let title = ""
				if (this._event.interview && this._event.interview.name && this._event.interview.name !== "") {
					title = [this._event.interview.name, this._event.interview.position, this._event.start_relative].filter((part) => part !== "").join("\n");
				} else {
					let tempTitle = this._event.title;
					if (this._event.title.length > 30) {
						tempTitle = this._event.title.slice(0, 27) + "...";
					}
					let truncate = wrap(tempTitle, {width: 12, trim: true});
					title = `${truncate}\n${this._event.start_relative}`;
				}

				let state = this._event.zoom_link ? State.Active : State.Inactive;
				ev.action.setState(state).then(() => ev.action.setTitle(title));
			}).catch((err) => {
				logger.warn("Error with calendar: ",err);
				ev.action.setState(State.Inactive).then(() => ev.action.setTitle(noNext));
			});
		}, 10000);
	}

	onWillDisappear(ev: WillDisappearEvent<NextMeetingSettings>): void | Promise<void> {
		if (this._interval) clearTimeout(this._interval);
		this._interval = undefined;
		this._event = undefined;
		ev.action.setState(State.Inactive);
		// ev.action.setTitle(noNext);
	}

	/**
	 * Listens for the {@link SingletonAction.onKeyDown} opens the next meeting.
	 */
	async onKeyDown(ev: KeyDownEvent<NextMeetingSettings>): Promise<void> {
		if (this._event === undefined) return;

		const links = [this._event.zoom_link];

		if (this._event.interview) {
			links.unshift(
				this._event.interview.scorecard,
				this._event.interview.guide,
			)
		}

		// Open all links
		Promise.all(links.map((link) => exec(`open "${link}"`))).catch((e) => {
			logger.warn("Unable to open meeting:\n" + e);
		}).then(() => {});
	}
}

/**
 * Settings for {@link JoinMeeting}.
 */
type NextMeetingSettings = {
	binaryPath: string;
};

/**
 * State for {@link JoinMeeting}.
 */
type JoinState = {
	name: string;
	link: string;
	timeString: string;
};
