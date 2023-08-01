/**
 * <div style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: 16}}>
 *  <p style={{fontWeight: "normal"}}>Official <a href="https://neo4j.com/docs/">Neo4j</a> adapter for Auth.js / NextAuth.js.</p>
 *  <a href="https://neo4j.com/">
 *   <img style={{display: "block"}} src="https://authjs.dev/img/adapters/neo4j.png" height="30"/>
 *  </a>
 * </div>
 *
 * ## Installation
 *
 * ```bash npm2yarn2pnpm
 * npm install @auth/neo4j-adapter neo4j-driver
 * ```
 *
 * @module @auth/neo4j-adapter
 */
import { type Session, isInt, integer } from "neo4j-driver"
import type { Adapter } from "@auth/core/adapters"

/** This is the interface of the Neo4j adapter options. The Neo4j adapter takes a {@link https://neo4j.com/docs/bolt/current/driver-api/#driver-session Neo4j session} as its only argument. */
export interface Neo4jOptions extends Session {}

/**
 * ## Setup
 *
 * Add this adapter to your `pages/api/[...nextauth].js` Auth.js configuration object.
 *
 * ```javascript title="pages/api/auth/[...nextauth].js"
 * import neo4j from "neo4j-driver"
 * import { Neo4jAdapter } from "@auth/neo4j-adapter"
 *
 * const driver = neo4j.driver(
 *   "bolt://localhost",
 *   neo4j.auth.basic("neo4j", "password")
 * )
 *
 * const neo4jSession = driver.session()
 *
 * // For more information on each option (and a full list of options) go to
 * // https://authjs.dev/reference/configuration/auth-options
 * export default NextAuth({
 *   // https://authjs.dev/reference/providers/oauth-builtin
 *   providers: [],
 *   adapter: Neo4jAdapter(neo4jSession),
 *   ...
 * })
 * ```
 * ## Advanced usage
 *
 * ### Schema
 *
 * #### Node labels
 *
 * The following node labels are used.
 *
 * - User
 * - Account
 * - Session
 * - VerificationToken
 *
 * #### Relationships
 *
 * The following relationships and relationship labels are used.
 *
 * - (:User)-[:HAS_ACCOUNT]->(:Account)
 * - (:User)-[:HAS_SESSION]->(:Session)
 *
 * #### Properties
 *
 * This schema is adapted for use in Neo4J and is based upon our main [models](https://authjs.dev/reference/adapters#models). Please check there for the node properties. Relationships have no properties.
 *
 * #### Indexes
 *
 * Optimum indexes will vary on your edition of Neo4j i.e. community or enterprise, and in case you have your own additional data on the nodes. Below are basic suggested indexes.
 *
 * 1. For **both** Community Edition & Enterprise Edition create constraints and indexes
 *
 * ```cypher
 *
 * CREATE CONSTRAINT user_id_constraint IF NOT EXISTS
 * ON (u:User) ASSERT u.id IS UNIQUE;
 *
 * CREATE INDEX user_id_index IF NOT EXISTS
 * FOR (u:User) ON (u.id);
 *
 * CREATE INDEX user_email_index IF NOT EXISTS
 * FOR (u:User) ON (u.email);
 *
 * CREATE CONSTRAINT session_session_token_constraint IF NOT EXISTS
 * ON (s:Session) ASSERT s.sessionToken IS UNIQUE;
 *
 * CREATE INDEX session_session_token_index IF NOT EXISTS
 * FOR (s:Session) ON (s.sessionToken);
 * ```
 *
 * 2.a. For Community Edition **only** create single-property indexes
 *
 * ```cypher
 * CREATE INDEX account_provider_index IF NOT EXISTS
 * FOR (a:Account) ON (a.provider);
 *
 * CREATE INDEX account_provider_account_id_index IF NOT EXISTS
 * FOR (a:Account) ON (a.providerAccountId);
 *
 * CREATE INDEX verification_token_identifier_index IF NOT EXISTS
 * FOR (v:VerificationToken) ON (v.identifier);
 *
 * CREATE INDEX verification_token_token_index IF NOT EXISTS
 * FOR (v:VerificationToken) ON (v.token);
 * ```
 *
 * 2.b. For Enterprise Edition **only** create composite node key constraints and indexes
 *
 * ```cypher
 * CREATE CONSTRAINT account_provider_composite_constraint IF NOT EXISTS
 * ON (a:Account) ASSERT (a.provider, a.providerAccountId) IS NODE KEY;
 *
 * CREATE INDEX account_provider_composite_index IF NOT EXISTS
 * FOR (a:Account) ON (a.provider, a.providerAccountId);
 *
 * CREATE CONSTRAINT verification_token_composite_constraint IF NOT EXISTS
 * ON (v:VerificationToken) ASSERT (v.identifier, v.token) IS NODE KEY;
 *
 * CREATE INDEX verification_token_composite_index IF NOT EXISTS
 * FOR (v:VerificationToken) ON (v.identifier, v.token);
 * ```
 */
export function Neo4jAdapter(session: Session): Adapter {
  const { read, write } = client(session)

  return {
    async createUser(data) {
      const user = { id: crypto.randomUUID(), ...data }
      await write(`CREATE (u:User $data)`, user)
      return user
    },

    async getUser(id) {
      return await read(`MATCH (u:User { id: $id }) RETURN u{.*}`, {
        id,
      })
    },

    async getUserByEmail(email) {
      return await read(`MATCH (u:User { email: $email }) RETURN u{.*}`, {
        email,
      })
    },

    async getUserByAccount(provider_providerAccountId) {
      return await read(
        `MATCH (u:User)-[:HAS_ACCOUNT]->(a:Account {
           provider: $provider,
           providerAccountId: $providerAccountId
         })
         RETURN u{.*}`,
        provider_providerAccountId
      )
    },

    async updateUser(data) {
      return (
        await write(
          `MATCH (u:User { id: $data.id })
           SET u += $data
           RETURN u{.*}`,
          data
        )
      ).u
    },

    async deleteUser(id) {
      return await write(
        `MATCH (u:User { id: $data.id })
         WITH u, u{.*} AS properties
         DETACH DELETE u
         RETURN properties`,
        { id }
      )
    },

    async linkAccount(data) {
      const { userId, ...a } = data
      await write(
        `MATCH (u:User { id: $data.userId })
         MERGE (a:Account {
           providerAccountId: $data.a.providerAccountId,
           provider: $data.a.provider
         }) 
         SET a += $data.a
         MERGE (u)-[:HAS_ACCOUNT]->(a)`,
        { userId, a }
      )
      return data
    },

    async unlinkAccount(provider_providerAccountId) {
      return await write(
        `MATCH (u:User)-[:HAS_ACCOUNT]->(a:Account {
           providerAccountId: $data.providerAccountId,
           provider: $data.provider
         })
         WITH u, a, properties(a) AS properties
         DETACH DELETE a
         RETURN properties { .*, userId: u.id }`,
        provider_providerAccountId
      )
    },

    async createSession(data) {
      const { userId, ...s } = format.to(data)
      await write(
        `MATCH (u:User { id: $data.userId })
         CREATE (s:Session)
         SET s = $data.s
         CREATE (u)-[:HAS_SESSION]->(s)`,
        { userId, s }
      )
      return data
    },

    async getSessionAndUser(sessionToken) {
      const result = await write(
        `OPTIONAL MATCH (u:User)-[:HAS_SESSION]->(s:Session { sessionToken: $data.sessionToken })
         WHERE s.expires <= datetime($data.now)
         DETACH DELETE s
         WITH count(s) AS c
         MATCH (u:User)-[:HAS_SESSION]->(s:Session { sessionToken: $data.sessionToken })
         RETURN s { .*, userId: u.id } AS session, u{.*} AS user`,
        { sessionToken, now: new Date().toISOString() }
      )

      if (!result?.session || !result?.user) return null

      return {
        session: format.from<any>(result.session),
        user: format.from<any>(result.user),
      }
    },

    async updateSession(data) {
      return await write(
        `MATCH (u:User)-[:HAS_SESSION]->(s:Session { sessionToken: $data.sessionToken })
         SET s += $data
         RETURN s { .*, userId: u.id }`,
        data
      )
    },

    async deleteSession(sessionToken) {
      return await write(
        `MATCH (u:User)-[:HAS_SESSION]->(s:Session { sessionToken: $data.sessionToken })
         WITH u, s, properties(s) AS properties
         DETACH DELETE s
         RETURN properties { .*, userId: u.id }`,
        { sessionToken }
      )
    },

    async createVerificationToken(data) {
      await write(
        `MERGE (v:VerificationToken {
           identifier: $data.identifier,
           token: $data.token
         })
         SET v = $data`,
        data
      )
      return data
    },

    async useVerificationToken(data) {
      const result = await write(
        `MATCH (v:VerificationToken {
           identifier: $data.identifier,
           token: $data.token
         })
         WITH v, properties(v) as properties
         DETACH DELETE v
         RETURN properties`,
        data
      )
      return format.from<any>(result?.properties)
    },
  }
}

// https://github.com/honeinc/is-iso-date/blob/master/index.js
const isoDateRE =
  /(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d\.\d+([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))|(\d{4}-[01]\d-[0-3]\dT[0-2]\d:[0-5]\d([+-][0-2]\d:[0-5]\d|Z))/

function isDate(value: any) {
  return value && isoDateRE.test(value) && !isNaN(Date.parse(value))
}

export const format = {
  /** Takes a plain old JavaScript object and turns it into a Neo4j compatible object */
  to(object: Record<string, any>) {
    const newObject: Record<string, unknown> = {}
    for (const key in object) {
      const value = object[key]
      if (value instanceof Date) newObject[key] = value.toISOString()
      else newObject[key] = value
    }
    return newObject
  },
  /** Takes a Neo4j object and returns a plain old JavaScript object */
  from<T = Record<string, unknown>>(object?: Record<string, any>): T | null {
    const newObject: Record<string, unknown> = {}
    if (!object) return null
    for (const key in object) {
      const value = object[key]
      if (isDate(value)) {
        newObject[key] = new Date(value)
      } else if (isInt(value)) {
        if (integer.inSafeRange(value)) newObject[key] = value.toNumber()
        else newObject[key] = value.toString()
      } else {
        newObject[key] = value
      }
    }

    return newObject as T
  },
}

function client(session: Session) {
  return {
    /** Reads values from the database */
    async read<T>(statement: string, values?: any): Promise<T | null> {
      const result = await session.readTransaction((tx) =>
        tx.run(statement, values)
      )

      return format.from<T>(result?.records[0]?.get(0)) ?? null
    },
    /**
     * Reads/writes values from/to the database.
     * Properties are available under `$data`
     */
    async write<T extends Record<string, any>>(
      statement: string,
      values: T
    ): Promise<any> {
      const result = await session.writeTransaction((tx) =>
        tx.run(statement, { data: format.to(values) })
      )

      return format.from<T>(result?.records[0]?.toObject())
    },
  }
}
