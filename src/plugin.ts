import streamDeck, { LogLevel } from "@elgato/streamdeck";

import { JoinMeeting } from "./actions/join-meeting";

// We can enable "trace" logging so that all messages between the Stream Deck, and the plugin are recorded. When storing sensitive information
streamDeck.logger.setLevel(LogLevel.TRACE);

// Register the join meeting action.
streamDeck.actions.registerAction(new JoinMeeting());

// Finally, connect to the Stream Deck.
streamDeck.connect();
