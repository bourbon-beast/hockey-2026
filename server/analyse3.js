import { getDb, all, get } from './db.js'

const db = await getDb()

// Bracket breakdown by 2025 primary team
const byTeam = all(`
  SELECT
    primary_team_id_2025 as team,
    CASE 
      WHEN total_games_2025 = 0 THEN '0'
      WHEN total_games_2025 <= 5 THEN '1-5'
      WHEN total_games_2025 <= 10 THEN '6-10'
      WHEN total_games_2025 <= 15 THEN '11-15'
      ELSE '16+'
    END as bracket,
    MIN(total_games_2025) as min_g,
    COUNT(*) as total,
    SUM(CASE WHEN status_id = 'planning' THEN 1 ELSE 0 END) as planning,
    SUM(CASE WHEN status_id = 'fill_in' THEN 1 ELSE 0 END) as fill_in,
    SUM(CASE WHEN status_id = 'unsure' THEN 1 ELSE 0 END) as unsure,
    SUM(CASE WHEN status_id = 'unlikely' THEN 1 ELSE 0 END) as unlikely,
    SUM(CASE WHEN status_id = 'not_heard' THEN 1 ELSE 0 END) as not_heard,
    SUM(CASE WHEN status_id = 'not_returning' THEN 1 ELSE 0 END) as not_returning
  FROM players
  WHERE status_id != 'new' AND primary_team_id_2025 IS NOT NULL
  GROUP BY primary_team_id_2025, bracket
  ORDER BY primary_team_id_2025, min_g
`)
console.log('BY_TEAM:', JSON.stringify(byTeam, null, 2))

// Team summary - total players, likely available (planning + fill_in + unsure)
const teamSummary = all(`
  SELECT
    primary_team_id_2025 as team,
    COUNT(*) as total_2025,
    SUM(CASE WHEN status_id IN ('planning','fill_in','unsure') THEN 1 ELSE 0 END) as engaged,
    SUM(CASE WHEN status_id = 'planning' THEN 1 ELSE 0 END) as planning,
    SUM(CASE WHEN status_id = 'fill_in' THEN 1 ELSE 0 END) as fill_in,
    SUM(CASE WHEN status_id IN ('planning','fill_in','unsure') AND total_games_2025 >= 6 THEN 1 ELSE 0 END) as core_engaged,
    SUM(CASE WHEN status_id IN ('planning','fill_in','unsure') AND total_games_2025 <= 5 THEN 1 ELSE 0 END) as casual_engaged,
    SUM(CASE WHEN status_id = 'not_heard' THEN 1 ELSE 0 END) as not_heard,
    SUM(CASE WHEN status_id = 'not_returning' THEN 1 ELSE 0 END) as not_returning
  FROM players
  WHERE status_id != 'new' AND primary_team_id_2025 IS NOT NULL
  GROUP BY primary_team_id_2025
  ORDER BY primary_team_id_2025
`)
console.log('TEAM_SUMMARY:', JSON.stringify(teamSummary, null, 2))

// Also check assigned_team_id_2026 to see where people are being placed
const assigned2026 = all(`
  SELECT
    assigned_team_id_2026 as team,
    COUNT(*) as total,
    SUM(CASE WHEN total_games_2025 <= 5 THEN 1 ELSE 0 END) as low_game_count
  FROM players
  WHERE assigned_team_id_2026 IS NOT NULL AND status_id != 'new'
  GROUP BY assigned_team_id_2026
  ORDER BY assigned_team_id_2026
`)
console.log('ASSIGNED_2026:', JSON.stringify(assigned2026, null, 2))
