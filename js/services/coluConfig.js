'use strict';

angular.module('copayAddon.colu')
  .provider('coluConfig', function () {

  var that = this;

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
  };

  this.$get = function() {
    return that.config;
  };
});
