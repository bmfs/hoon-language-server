import { Channel } from "urbit-airlock/lib/channel";
import { connect } from "urbit-airlock/lib/setup";

import { Server } from "./server"
import { Config } from "./util";
import * as qs from "querystring";
import * as yargs from "yargs";

(async function main() {
  const { ship, url, code: password, port, delay }: Config = yargs.options({
    port: {
      alias: "p",
      default: 80,
      description: "HTTP port of the running urbit"
    },
    delay: {
      alias: "d",
      default: 0,
      description: "Delay for running didSave events"
    },
    url: {
      alias: "u",
      default: "http://localhost",
      description: "URL of the running urbit"
    },
    ship: {
      alias: "s",
      default: "zod",
      description: "@p of the running urbit, without leading sig"
    },
    code: {
      alias: "c",
      default: "lidlut-tabwed-pillex-ridrup",
      description: "+code of the running urbit"
    }
  }).argv;

  console.log(process.argv)
  const connection = await connect(ship, url, port, password);

  const channel = new Channel(connection);

  const server = new Server(channel, delay);

  server.serve();
})();
