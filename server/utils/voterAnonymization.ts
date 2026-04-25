import type { Database } from 'better-sqlite3'

export type VoterAnonymizeMode = 'anonymize' | 'full'

type SqlValue = string | number | null

function getTableColumns(database: Database, tableName: string): Set<string> {
  try {
    const rows = database.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>
    return new Set(rows.map((row) => String(row.name)))
  } catch {
    return new Set()
  }
}

function buildAnonymizedName(voterId: number): string {
  return `已匿名選民 #${voterId}`
}

function updateExistingColumns(
  database: Database,
  tableName: string,
  values: Record<string, SqlValue>,
  whereClause: string,
  whereParams: SqlValue[] = [],
): number {
  const columns = getTableColumns(database, tableName)
  const existingEntries = Object.entries(values).filter(([columnName]) => columns.has(columnName))
  if (existingEntries.length === 0) return 0

  const assignments = existingEntries.map(([columnName]) => `${columnName}=?`)
  const params = existingEntries.map(([, value]) => value)

  if (columns.has('updated_at')) {
    assignments.push("updated_at=datetime('now','localtime')")
  }

  const result = database
    .prepare(`UPDATE ${tableName} SET ${assignments.join(', ')} WHERE ${whereClause}`)
    .run(...params, ...whereParams)

  return Number(result.changes || 0)
}

function deleteIfTableExists(
  database: Database,
  tableName: string,
  whereClause: string,
  whereParams: SqlValue[] = [],
): number {
  if (getTableColumns(database, tableName).size === 0) return 0
  const result = database.prepare(`DELETE FROM ${tableName} WHERE ${whereClause}`).run(...whereParams)
  return Number(result.changes || 0)
}

function clearVoterRelations(database: Database, voterId: number): number {
  const columns = getTableColumns(database, 'voter_relations')
  if (columns.size === 0) return 0

  const clauses: string[] = []
  const params: number[] = []
  for (const columnName of ['voter_id', 'related_voter_id', 'voter_id_a', 'voter_id_b']) {
    if (columns.has(columnName)) {
      clauses.push(`${columnName}=?`)
      params.push(voterId)
    }
  }
  if (clauses.length === 0) return 0

  const result = database
    .prepare(`DELETE FROM voter_relations WHERE ${clauses.join(' OR ')}`)
    .run(...params)
  return Number(result.changes || 0)
}

function scrubVoterSnapshots(database: Database, voterId: number, replacementName: string): void {
  updateExistingColumns(
    database,
    'contact_records',
    {
      content: `已匿名化聯絡紀錄（原選民 #${voterId}）`,
      result: null,
      result_type: null,
      follow_up_date: null,
    },
    'voter_id=?',
    [voterId],
  )

  updateExistingColumns(
    database,
    'consultation_appointments',
    {
      voter_name: replacementName,
      voter_phone: null,
    },
    'voter_id=?',
    [voterId],
  )

  updateExistingColumns(
    database,
    'survey_responses',
    {
      respondent_name: replacementName,
    },
    'voter_id=?',
    [voterId],
  )

  updateExistingColumns(
    database,
    'ceremony_records',
    {
      recipient_name: replacementName,
      recipient_relation: null,
    },
    'voter_id=?',
    [voterId],
  )

  updateExistingColumns(
    database,
    'petitions',
    {
      contact_phone: null,
    },
    'voter_id=?',
    [voterId],
  )
}

export function anonymizeVoter(database: Database, voterId: number, mode: VoterAnonymizeMode = 'anonymize') {
  const replacementName = buildAnonymizedName(voterId)

  updateExistingColumns(
    database,
    'voters',
    {
      name: replacementName,
      gender: null,
      birth_date: null,
      id_number: null,
      mobile: null,
      phone: null,
      line_id: null,
      email: null,
      household_city: null,
      household_district: null,
      household_village: null,
      household_neighbor: null,
      household_address: null,
      mailing_address: null,
      occupation: null,
      company: null,
      job_title: null,
      election_area: null,
      note: null,
      source: null,
      referrer_id: null,
      addr_city: null,
      addr_district: null,
      addr_village: null,
      household_key: null,
      title: null,
      is_active: 0,
      is_blacklisted: 0,
    },
    'id=?',
    [voterId],
  )

  deleteIfTableExists(database, 'voter_tags', 'voter_id=?', [voterId])
  deleteIfTableExists(database, 'voter_topics', 'voter_id=?', [voterId])
  deleteIfTableExists(database, 'voter_engagement', 'voter_id=?', [voterId])
  deleteIfTableExists(database, 'voter_activity_history', 'voter_id=?', [voterId])
  deleteIfTableExists(database, 'group_members', 'voter_id=?', [voterId])
  deleteIfTableExists(database, 'event_participants', 'voter_id=?', [voterId])
  deleteIfTableExists(database, 'notification_recipients', 'voter_id=?', [voterId])
  clearVoterRelations(database, voterId)

  if (mode === 'full') {
    scrubVoterSnapshots(database, voterId, replacementName)
  }

  updateExistingColumns(database, 'voters', { referrer_id: null }, 'referrer_id=?', [voterId])
  updateExistingColumns(database, 'groups', { leader_id: null }, 'leader_id=?', [voterId])
  updateExistingColumns(database, 'groups', { contact_id: null }, 'contact_id=?', [voterId])
  updateExistingColumns(database, 'contact_records', { voter_id: null }, 'voter_id=?', [voterId])
  updateExistingColumns(database, 'petitions', { voter_id: null }, 'voter_id=?', [voterId])
  updateExistingColumns(database, 'tasks', { related_voter_id: null }, 'related_voter_id=?', [voterId])
  updateExistingColumns(database, 'survey_responses', { voter_id: null }, 'voter_id=?', [voterId])
  updateExistingColumns(database, 'consultation_appointments', { voter_id: null }, 'voter_id=?', [voterId])
  updateExistingColumns(database, 'ceremony_records', { voter_id: null }, 'voter_id=?', [voterId])

  return {
    voterId,
    mode,
    replacementName,
  }
}

export function buildInactiveVoterAnonymizePreviewWhereClause(): string {
  return `
    is_active=0
      AND updated_at < datetime('now','localtime', ?)
      AND (
        name NOT LIKE '已匿名選民 #%'
        OR gender IS NOT NULL
        OR birth_date IS NOT NULL
        OR id_number IS NOT NULL
        OR mobile IS NOT NULL
        OR phone IS NOT NULL
        OR line_id IS NOT NULL
        OR email IS NOT NULL
        OR household_city IS NOT NULL
        OR household_district IS NOT NULL
        OR household_village IS NOT NULL
        OR household_neighbor IS NOT NULL
        OR household_address IS NOT NULL
        OR mailing_address IS NOT NULL
        OR occupation IS NOT NULL
        OR company IS NOT NULL
        OR job_title IS NOT NULL
        OR election_area IS NOT NULL
        OR note IS NOT NULL
        OR source IS NOT NULL
        OR referrer_id IS NOT NULL
        OR addr_city IS NOT NULL
        OR addr_district IS NOT NULL
        OR addr_village IS NOT NULL
        OR household_key IS NOT NULL
        OR title IS NOT NULL
        OR EXISTS (SELECT 1 FROM voter_tags WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM voter_topics WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM voter_engagement WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM voter_activity_history WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM voter_relations WHERE voter_id=voters.id OR related_voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM voters ref WHERE ref.referrer_id=voters.id)
        OR EXISTS (SELECT 1 FROM groups g WHERE g.leader_id=voters.id OR g.contact_id=voters.id)
        OR EXISTS (SELECT 1 FROM contact_records WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM petitions WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM tasks WHERE related_voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM survey_responses WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM consultation_appointments WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM ceremony_records WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM group_members WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM event_participants WHERE voter_id=voters.id)
        OR EXISTS (SELECT 1 FROM notification_recipients WHERE voter_id=voters.id)
      )
  `
}
