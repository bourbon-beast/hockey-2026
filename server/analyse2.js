import { getDb, all, get } from './db.js'

const db = await getDb()

const overview = get(`
  SELECT 
    COUNT(*) as total,
    SUM(CASE WHEN status_id = 'planning' THEN 1 ELSE 0 END) as planning,
    SUM(CASE WHEN status_id = 'fill_in' THEN 1 ELSE 0 END) as fill_in,
    SUM(CASE WHEN status_id = 'unsure' THEN 1 ELSE 0 END) as unsure,
    SUM(CASE WHEN status_id = 'unlikely' THEN 1 ELSE 0 END) as unlikely,
    SUM(CASE WHEN status_id = 'new' THEN 1 ELSE 0 END) as new_reg,
    SUM(CASE WHEN status_id = 'not_returning' THEN 1 ELSE 0 END) as not_returning,
    SUM(CASE WHEN status_id = 'not_heard' THEN 1 ELSE 0 END) as not_heard
  FROM players
`)
console.log('OVERVIEW:', JSON.stringify(overview))

const brackets = all(`
  SELECT
    CASE 
      WHEN total_games_2025 = 0 THEN '0 games'
      WHEN total_games_2025 <= 3 THEN '1-3 games'
      WHEN total_games_2025 <= 5 THEN '4-5 games'
      WHEN total_games_2025 <= 8 THEN '6-8 games'
      WHEN total_games_2025 <= 12 THEN '9-12 games'
      WHEN total_games_2025 <= 16 THEN '13-16 games'
      ELSE '17+ games'
    END as bracket,
    COUNT(*) as total,
    SUM(CASE WHEN status_id IN ('planning','fill_in','unsure') THEN 1 ELSE 0 END) as engaged,
    SUM(CASE WHEN status_id = 'not_returning' THEN 1 ELSE 0 END) as not_returning,
    SUM(CASE WHEN status_id = 'not_heard' THEN 1 ELSE 0 END) as not_heard,
    MIN(total_games_2025) as min_g
  FROM players
  WHERE status_id != 'new'
  GROUP BY bracket
  ORDER BY min_g
`)
console.log('BRACKETS:', JSON.stringify(brackets))

const lowEngaged = all(`
  SELECT name, total_games_2025, status_id, assigned_team_id_2026, primary_team_id_2025
  FROM players
  WHERE total_games_2025 > 0 AND total_games_2025 <= 5 AND status_id IN ('planning','unsure','fill_in')
  ORDER BY total_games_2025, name
`)
console.log('LOW_GAME_ENGAGED count:', lowEngaged.length)
console.log('LOW_GAME_ENGAGED:', JSON.stringify(lowEngaged))

const gamesDist = all(`
  SELECT total_games_2025, COUNT(*) as player_count
  FROM players
  WHERE total_games_2025 > 0 AND status_id != 'new'
  GROUP BY total_games_2025
  ORDER BY total_games_2025
`)
console.log('GAMES_DIST:', JSON.stringify(gamesDist))
