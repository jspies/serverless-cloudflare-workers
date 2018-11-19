/**
 * Copyright (c) 2018, Cloudflare. All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without modification, are permitted provided that the following conditions are met:
 *
 *  1. Redistributions of source code must retain the above copyright notice, this list of conditions and the following disclaimer.
 *  2. Redistributions in binary form must reproduce the above copyright notice, this list of conditions and the following disclaimer in the documentation and/or other materials provided with the distribution.
 *  3. Neither the name of the copyright holder nor the names of its contributors may be used to endorse or promote products derived from this software without specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY EXPRESS OR
 * IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY
 * AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR
 * CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
 * DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE,
 * DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER
 * IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT
 * OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
 */
const sdk = require("../../provider/sdk");
const { generateCode } = require("./workerScript");
const BB = require("bluebird");
const webpack = require("../../utils/webpack");

module.exports = {
  async multiScriptWorkerAPI(scriptContents, scriptName) {
    const { accountId } = this.provider.config;
    return await sdk.cfApiCall({
      url: `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
      method: `PUT`,
      contentType: `application/javascript`,
      body: scriptContents
    });
  },

  async multiScriptRoutesAPI(pattern, scriptName, zoneId) {
    const payload = { pattern, script: scriptName };
    return await sdk.cfApiCall({
      url: `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
      method: `POST`,
      contentType: `application/json`,
      body: JSON.stringify(payload)
    });
  },

  async getRoutesMultiScript(zoneId) {
    return await sdk.cfApiCall({
      url: `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
      method: `GET`,
      contentType: `application/javascript`
    });
  },

  getRoutes(events) {
    return events.map(function(event) {
      if (event.http) {
        return event.http.url;
      }
    });
  },

  async multiScriptDeploy(funcObj) {
    return BB.bind(this)
    .then(async () => {

      const { zoneId } = this.provider.config;

      let workerScriptResponse;
      let routesResponse = [];

      const scriptContents = generateCode(funcObj);

      const { name: scriptName } = funcObj;

      const response = await this.multiScriptWorkerAPI(
        scriptContents,
        scriptName
      );

      workerScriptResponse = response;
      const allRoutes = this.getRoutes(funcObj.events);

      for (const pattern of allRoutes) {
        this.serverless.cli.log(`deploying route: ${pattern} `);
        const rResponse = await this.multiScriptRoutesAPI(
          pattern,
          scriptName,
          zoneId
        );
        routesResponse.push(rResponse);
      }

      return {
        workerScriptResponse,
        routesResponse
      };
    });
  },

  async multiScriptDeployAll() {

    const functions = this.serverless.service.getAllFunctions();

    if (typeof(functions) === 'undefined' || functions === null) {
      throw new Error("Incorrect template being used for a MultiScript user ");
    }

    let workerResponse = [];
    let routesResponse = [];

    for (const scriptName of functions) {
      const functionObject = this.getFunctionObjectFromScriptName(scriptName);

      if (functionObject.webpack) {
        await webpack.pack(this.serverless, functionObject);
      }

      this.serverless.cli.log(`deploying script: ${scriptName}`);

      const {
        workerScriptResponse,
        routesResponse: rResponse
      } = await this.multiScriptDeploy(functionObject);
      workerResponse.push(workerScriptResponse);
      routesResponse.push(rResponse);
    }

    return {
      workerScriptResponse: workerResponse,
      routesResponse,
      isMultiScript: true
    };
  }
};
