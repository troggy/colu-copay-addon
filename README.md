[Copay](https://github.com/bitpay/copay) addon with support for [Colu](http://colu.co).

Not really an addon, since Copay doesn't have addon system, but rather an easy to drop in
bunch of code that makes Copay aware of ColoredCoins. Works for Copay 2.7.0+, may not work with other versions.

# Setup

You can either use Colu SDK or Colu API with this addon. Depending on your choice set up will be slightly different.

## Option 1. Using Colu SDK.

Colu wallet code will be bundled into your app.

1. Load ``colu-copay-addon.js`` somewhere in your app's html files.

2. Use ``coluConfigProvider`` to set Colu API key. You can find your key in Colu Dashboard.

````
coluConfigProvider.config({
  mode: 'sdk',
  apiKey: '<YOUR COLU API KEY>'
});
````

## Option 2. Using Colu API.

You will need to run Colu Server somewhere. This option is mostly useful if you want to build mobile application — you don't need to include all the Colu wallet code into your app making your app smaller in size and thus faster to load.

1. Load ``colu-copay-addon.rpc-only.js`` somewhere in your app's html files.

2. Use ``coluConfigProvider`` to point to your Colu Server instance.

````
coluConfigProvider.config({
  mode: 'rpc',
  rpcConfig: {
    livenet: {
      baseUrl: '<YOUR COLU MAINNET SERVER HOST>',      // Colu JSON RPC host
      authName: '<YOUR COLU MAINNET SERVER AUTH USERNAME>',  // (optional) Colu JSON RPC username for Basic Auth
      authSecret: '<YOUR COLU MAINNET SERVER AUTH PASSWORD>',  // (optional) Colu JSON RPC password for Basic Auth
    },
    testnet: {
      baseUrl: '<YOUR COLU TESTNET SERVER HOST>',      // Colu JSON RPC host
      authName: '<YOUR COLU TESTNET SERVER AUTH USERNAME>',  // (optional) Colu JSON RPC username for Basic Auth
      authSecret: '<YOUR COLU TESTNET SERVER AUTH PASSWORD>',  // (optional) Colu JSON RPC password for Basic Auth
    }
  }
});
````
