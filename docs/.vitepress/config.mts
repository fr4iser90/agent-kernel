import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'agent-kernel',
  description: 'Project + agent control plane documentation',
  lang: 'en-US',
  cleanUrls: true,
  ignoreDeadLinks: [
    // Pack stubs live outside the VitePress root
    /\/lawpack\//,
  ],
  themeConfig: {
    nav: [
      { text: 'Tutorials', link: '/tutorials/getting-started' },
      { text: 'How-to', link: '/how-to/init' },
      { text: 'Reference', link: '/reference/settings' },
      { text: 'Explanation', link: '/explanation/vision' },
      { text: 'ADRs', link: '/adr/0001-control-plane-vs-lawpack' },
    ],
    sidebar: [
      {
        text: 'Tutorials',
        items: [{ text: 'Getting started', link: '/tutorials/getting-started' }],
      },
      {
        text: 'How-to',
        items: [
          { text: 'Init a project', link: '/how-to/init' },
          { text: 'Assign an agent', link: '/how-to/assign-agent' },
          { text: 'Nudge a run', link: '/how-to/nudge-run' },
          { text: 'Check health', link: '/how-to/check-health' },
          { text: 'Backup', link: '/how-to/backup' },
          { text: 'Run the gate', link: '/how-to/run-the-gate' },
        ],
      },
      {
        text: 'Reference',
        items: [
          { text: 'Settings', link: '/reference/settings' },
          { text: 'Schemas', link: '/reference/schemas/readme' },
          { text: 'Data model', link: '/reference/data-model' },
          { text: 'Orchestration API', link: '/reference/orchestration-api' },
          { text: 'Inject runtime', link: '/reference/inject-runtime' },
          { text: 'Lawpack', link: '/reference/lawpack' },
          { text: 'Start policy', link: '/reference/start-policy' },
          { text: 'Operator tools', link: '/reference/operator-tools' },
          { text: 'Analyzer', link: '/reference/analyzer' },
          { text: 'Naming', link: '/reference/naming' },
          { text: 'Tree', link: '/reference/tree' },
        ],
      },
      {
        text: 'Explanation',
        items: [
          { text: 'Vision', link: '/explanation/vision' },
          { text: 'Architecture', link: '/explanation/architecture' },
          { text: 'Orchestration', link: '/explanation/orchestration' },
          { text: 'Actors (human vs AI)', link: '/explanation/actors' },
          { text: 'Docs coverage', link: '/explanation/docs-coverage' },
          { text: 'Operating model', link: '/explanation/operating-model' },
          { text: 'UI', link: '/explanation/ui' },
          { text: 'Settings UI', link: '/explanation/settings-ui' },
          { text: 'Runtime topology', link: '/explanation/runtime-topology' },
          { text: 'Integrations', link: '/explanation/integrations' },
          { text: 'Roadmap', link: '/explanation/roadmap' },
          { text: 'Doc freeze', link: '/explanation/doc-freeze' },
          { text: 'Comparables', link: '/explanation/comparables' },
        ],
      },
      {
        text: 'ADRs',
        items: [
          { text: '0001 Control plane vs Lawpack', link: '/adr/0001-control-plane-vs-lawpack' },
          { text: '0002 Stack pin', link: '/adr/0002-stack-pin' },
          { text: '0003 Single-user v1', link: '/adr/0003-single-user-v1' },
          { text: '0004 Dual injection', link: '/adr/0004-dual-injection-multi-executor' },
          { text: '0005 Persistence SQLite/Postgres', link: '/adr/0005-persistence-sqlite-postgres' },
        ],
      },
    ],
    socialLinks: [{ icon: 'github', link: 'https://github.com/fr4iser90/agent-kernel' }],
  },
})
