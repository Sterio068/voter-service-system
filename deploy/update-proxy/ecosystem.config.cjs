module.exports = {
  apps: [
    {
      name: 'voter-service-update-proxy',
      cwd: '/opt/voter-service-system',
      script: 'node_modules/.bin/tsx',
      args: 'server/updateProxyServer.ts',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '256M',
      env: {
        NODE_ENV: 'production',
      },
      env_file: '/etc/voter-service-system/update-proxy.env',
    },
  ],
}
