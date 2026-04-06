// hvLinks.js — Hockey Victoria URLs for each Mentone men's team
//
// TODO: Move these into the config/teams Firestore doc as hvCompUrl + hvTeamUrl
//       fields so they're editable without a code deploy. For now hardcoded
//       as they won't change within a season.
//
// URL patterns:
//   Competition: https://www.hockeyvictoria.org.au/games/{seasonId}/{compId}
//   Team:        https://www.hockeyvictoria.org.au/games/team/{seasonId}/{teamId}

const HV_BASE = 'https://www.hockeyvictoria.org.au'

export const HV_LINKS = {
  PL: {
    compUrl:   `${HV_BASE}/games/25879/42156`,
    teamUrl:   `${HV_BASE}/games/team/25879/409898`,
    ladderUrl: `${HV_BASE}/pointscore/25879/42156`,
  },
  PLR: {
    compUrl:   `${HV_BASE}/games/25879/42243`,
    teamUrl:   `${HV_BASE}/games/team/25879/412426`,
    ladderUrl: `${HV_BASE}/pointscore/25879/42243`,
  },
  PB: {
    compUrl:   `${HV_BASE}/games/25879/42237`,
    teamUrl:   `${HV_BASE}/games/team/25879/412423`,
    ladderUrl: `${HV_BASE}/pointscore/25879/42237`,
  },
  PC: {
    compUrl:   `${HV_BASE}/games/25879/42238`,
    teamUrl:   `${HV_BASE}/games/team/25879/412424`,
    ladderUrl: `${HV_BASE}/pointscore/25879/42238`,
  },
  PE: {
    compUrl:   `${HV_BASE}/games/25879/42242`,
    teamUrl:   `${HV_BASE}/games/team/25879/412425`,
    ladderUrl: `${HV_BASE}/pointscore/25879/42242`,
  },
  Metro: {
    compUrl:   `${HV_BASE}/games/25879/42235`,
    teamUrl:   `${HV_BASE}/games/team/25879/412422`,
    ladderUrl: `${HV_BASE}/pointscore/25879/42235`,
  },
}
