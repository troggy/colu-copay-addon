'use strict';

angular.module('copayAddon.colu')
  .provider('colu', function (coluSdkProvider, coluRpcProvider) {

  this.config = {
    apiKey: '',
    mode: 'sdk',
    rpcConfig: {
      livenet: {
        rpcHost: '',      // Colu JSON RPC host
        rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth
        rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth
      },
      testnet: {
        rpcHost: '',      // Colu JSON RPC host
        rpcUsername: '',  // (optional) Colu JSON RPC username for Basic Auth
        rpcPassword: '',  // (optional) Colu JSON RPC password for Basic Auth
      }
    }
  };

  this.config = function(config) {
    this.config = Object.assign({}, this.config, config);
    coluSdkProvider.setApiKey(config.apiKey);
    coluRpcProvider.configure(config.rpcConfig);
  };

  this.$get = function(coluRpc, coluSdk) {
    return this.config.mode === 'rpc' ? coluRpc : coluSdk;
  };
});
