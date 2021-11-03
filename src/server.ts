import { REQUEST_MARK, RESPONSE_MARK, NOTIFICATION_MARK } from "./marks";
import * as rpc from "vscode-jsonrpc";
import { NotificationMessage, RequestMessage } from "vscode-languageserver";
import pino from "pino";
import { uniqueId } from "lodash";

import { Channel } from "urbit-airlock/lib/channel";
import { connect } from "urbit-airlock/lib/setup";

import { wait, request, Config } from "./util";

const logger = pino(
  { level: "trace" },
  pino.destination("/tmp/hoon-language-server.log")
);

interface RequestContinuation {
  (result: any): void;
}

const app = "language-server";
const path = "/primary";

export class Server {
  connection: rpc.MessageConnection;
  subscription: number | null = null;
  outstandingRequests: Map<string, RequestContinuation> = new Map();
  constructor(private channel: Channel, private delay: number) {
    this.connection = rpc.createMessageConnection(
      new rpc.StreamMessageReader(process.stdin),
      new rpc.StreamMessageWriter(process.stdout)
    );
    // this.connection.trace(rpc.Trace.Messages, tracer);

    this.connection.onNotification((method, params) =>
      this.onNotification(method, params)
    );
    this.connection.onRequest((method, params) =>
      this.onRequest(method, params)
    );
  }

  initialise() {
    return {
      capabilities: {
        hoverProvider: true,
        textDocumentSync: {
          openClose: true,
          change: 2,
          willSave: true,
          save: true
        },
        definitionProvider: true,
        completionProvider: {
          resolveProvider: false,
          triggerCharacters: [
            "-",
            "+",
            "^",
            "!",
            "@",
            "$",
            "%",
            ".",
            "%",
            "&",
            "*",
            "/",
            ",",
            ">",
            "<",
            "~",
            "|",
            "=",
            ";",
            ":",
            "_"
          ]
        },
        workspace: {
          workspaceFolders: {
            supported: true,
            changeNotifications: true
          }
        }
      }
    };
  }

  serve() {
    // const onUpdate =
    // const onError = this.onSubscriptionErr.bind(this);
    this.channel.subscribe(app, path, {
      mark: "json",
      onError: (e: any) => this.onSubscriptionErr(e),
      onEvent: (u: any) => this.onSubscriptionUpdate(u),
      onQuit: (e: any) => this.onSubscriptionErr(e)
    });
    new Promise(() => this.connection.listen());
  }

  // handlers

  onNotification(method: string, params: any[]) {
    logger.debug({ method, params });
    if (method === "textDocument/didSave") {
      wait(this.delay).then(() => {
        logger.debug("Delayed didSave");
        this.pokeNotification({ jsonrpc: "2.0", method, params });
      });
    }
    this.pokeNotification({ jsonrpc: "2.0", method, params });
  }

  onRequest(method: string, params: any[]) {
    const id = uniqueId();

    if (method === "initialize") {
      return this.initialise();
    } else {
      logger.info({ message: `caught request`, id });
      this.pokeRequest({ jsonrpc: "2.0", method, params, id });
      return this.waitOnResponse(id).then(r => {
        logger.info({ message: `returning request`, id, r });
        return r;
      });
    }
  }

  waitOnResponse(id: string) {
    return new Promise((resolve, reject) => {
      this.outstandingRequests.set(id, resolve);
    });
  }

  pokeRequest(message: RequestMessage) {
    return this.channel.poke(app, { mark: REQUEST_MARK, data: message });
  }

  pokeNotification(message: NotificationMessage) {
    return this.channel.poke(app, { mark: NOTIFICATION_MARK, data: message });
  }

  // Subscriptions

  onSubscriptionUpdate(update: any) {
    logger.info({ message: "Subscription update", update });

    if (update.hasOwnProperty("id")) {
      const response = this.outstandingRequests.get(update.id);
      if (response) {
        response(update.result);
      } else {
        logger.warn("Unrecognised request", { update });
      }
    } else {
      this.connection.sendNotification(update.method, update.params);
    }
  }

  onSubscriptionErr(e: any) {
    logger.fatal({ message: "Subscription Errored", e });
  }

  onSubscriptionQuit(e: any) {
    logger.fatal({ message: "Subscription Quit", e });
  }
}
