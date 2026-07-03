## Module Providers

You can create module providers, such as Notification or File Module Providers under a sub-directory of this directory. For example, `src/providers/my-notification`.

This package currently tombstones top-level provider exports in `package.json` because no provider implementation is shipped from this directory. Before registering a provider as `plugin-name/providers/my-notification`, restore a matching `./providers/*` export and verify the package with `corepack pnpm plugins:release-check -- --filter @medusastore/medusa-plugin-support-tickets`.

Then, you register the provider in the Medusa application as `plugin-name/providers/my-notification`:

```ts
module.exports = defineConfig({
  // ...
  modules: [
    {
      resolve: '@medusajs/medusa/notification',
      options: {
        providers: [
          {
            resolve: '@myorg/plugin-name/providers/my-notification',
            id: 'my-notification',
            options: {
              channels: ['email'],
              // provider options...
            },
          },
        ],
      },
    },
  ],
})
```

Learn more in [this documentation](https://docs.medusajs.com/learn/fundamentals/plugins/create).
