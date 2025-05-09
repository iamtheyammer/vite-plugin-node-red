// This is the Node's "JavaScript file" - it runs in the BACKEND (not the UI),
// and is where you define the Node's functionality when it receives a message.
//
// Since this runs in a node environment, you can use any Node.js modules.

import { Node, NodeAPI } from "node-red";

module.exports = function (RED: NodeAPI) {
  function LowercaseNode(config: never) {
    // @ts-ignore - this is the backend, and our RED import is for the frontend
    RED.nodes.createNode(this, config);

    // @ts-ignore
    const node = this as unknown as Node;

    node.on("input", function (msg, send, done) {
      // do something with 'msg'
      if (typeof msg.payload === "string") {
        msg.payload = msg.payload.toLowerCase();
      } else {
        node.error("Input payload is not a string");
      }

      send(msg);
      done();
    });
  }

  RED.nodes.registerType("lowercase", LowercaseNode);
};
