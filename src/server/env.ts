function required(name: string): string {
  const value = process.env[name]
  if (!value?.trim()) throw new Error(`${name} is required.`)
  return value
}

/** Read lazily so importing a module never fails a build that lacks runtime configuration. */
export function env() {
  const allowLocalhost = process.env.ALLOW_LOCALHOST ?? 'false'
  if (allowLocalhost !== 'true' && allowLocalhost !== 'false')
    throw new Error('ALLOW_LOCALHOST must be true or false.')
  return {
    databaseUrl: required('DATABASE_URL'),
    authSecret: required('BETTER_AUTH_SECRET'),
    baseUrl: required('BETTER_AUTH_URL'),
    github: {
      clientId: required('GITHUB_CLIENT_ID'),
      clientSecret: required('GITHUB_CLIENT_SECRET'),
    },
    /** Development only: lets the canary run at http://localhost. */
    allowLocalhost: allowLocalhost === 'true',
  }
}
