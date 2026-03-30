import { readFileSync, writeFileSync } from 'fs'

const filePath = 'F:/Documents/Steve/Development/hockey-2026/server/index.js'
let content = readFileSync(filePath, 'utf8')

const oldQuery = `  const byTeam = all(\`
    SELECT 
      t.id as team_id,
      t.name as team_name,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' THEN p.id END) as main_squad,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'not_heard' THEN p.id END) as not_heard,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'planning' THEN p.id END) as planning,
      COUNT(DISTINCT CASE WHEN p.assigned_team_id_2026 = t.id THEN p.id END) as assigned_2026
    FROM teams t
    LEFT JOIN player_team_history pth ON pth.team_id = t.id
    LEFT JOIN players p ON p.id = pth.player_id
    GROUP BY t.id
    ORDER BY t.sort_order
  \`)`

const newQuery = `  // Per-team aggregate counts
  const byTeam = all(\`
    SELECT 
      t.id as team_id,
      t.name as team_name,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' THEN p.id END) as main_squad,
      COUNT(DISTINCT CASE WHEN pth.role = 'fill_in'    THEN p.id END) as fill_ins,
      COUNT(DISTINCT CASE WHEN p.assigned_team_id_2026 = t.id THEN p.id END) as assigned_2026,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'planning'      THEN p.id END) as s_planning,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'unsure'        THEN p.id END) as s_unsure,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'unlikely'      THEN p.id END) as s_unlikely,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'not_heard'     THEN p.id END) as s_not_heard,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'not_returning' THEN p.id END) as s_not_returning,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'fill_in'       THEN p.id END) as s_fill_in,
      COUNT(DISTINCT CASE WHEN pth.role = 'main_squad' AND p.status_id = 'new'           THEN p.id END) as s_new
    FROM teams t
    LEFT JOIN player_team_history pth ON pth.team_id = t.id
    LEFT JOIN players p ON p.id = pth.player_id
    WHERE t.id != 'NEW'
    GROUP BY t.id
    ORDER BY t.sort_order
  \`)`

if (!content.includes(oldQuery)) {
  console.error('ERROR: could not find byTeam query to replace')
  process.exit(1)
}

content = content.replace(oldQuery, newQuery)
writeFileSync(filePath, content, 'utf8')
console.log('Done — byTeam query updated')
