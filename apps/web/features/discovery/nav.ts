// Discovery nav constants — topic categories. Reuses the feed topic taxonomy from
// ./types so the nav and the `/feed` topic filter agree.

import { FEED_TOPIC_LABELS, type FeedTopic } from "./types";

export const DISCOVERY_TOPICS = Object.keys(FEED_TOPIC_LABELS) as FeedTopic[];
