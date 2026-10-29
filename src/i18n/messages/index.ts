import type { AreaMessages, Locale, PhraseMap } from "../types.ts";

import { admin } from "./admin.ts";
import { common } from "./common.ts";
import { fixtures } from "./fixtures.ts";
import { landing } from "./landing.ts";
import { layout } from "./layout.ts";
import { login } from "./login.ts";
import { matches } from "./matches.ts";
import { participant } from "./participant.ts";
import { publicMessages } from "./public.ts";
import { scoring } from "./scoring.ts";
import { teams } from "./teams.ts";
import { tournaments } from "./tournaments.ts";

const areas: AreaMessages[] = [
  common,
  layout,
  landing,
  login,
  participant,
  scoring,
  tournaments,
  teams,
  fixtures,
  matches,
  admin,
  publicMessages,
];

const mr: PhraseMap = {};
const hi: PhraseMap = {};

for (const area of areas) {
  Object.assign(mr, area.mr);
  Object.assign(hi, area.hi);
}

export const messages: Record<Exclude<Locale, "en">, PhraseMap> = { mr, hi };
