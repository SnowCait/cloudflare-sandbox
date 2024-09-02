use futures::StreamExt;
use nostr::{
    message::{ClientMessage, RelayMessage},
    util::JsonUtil,
    secp256k1::Secp256k1,
};
use worker::*;

#[event(fetch)]
async fn fetch(_req: Request, _env: Env, _ctx: Context) -> Result<Response> {
    console_error_panic_hook::set_once();
    let Ok(Some(upgrade)) = _req.headers().get("Upgrade") else {
        return Response::ok("Hello");
    };
    if upgrade != "websocket" {
        return Response::ok("World");
    }
    let pair = WebSocketPair::new()?;
    let client = pair.client;
    let server = pair.server;
    server.accept()?;
    wasm_bindgen_futures::spawn_local(async move {
        let mut event_stream = server.events().expect("could not open stream");

        let secp = Secp256k1::new();

        while let Some(event) = event_stream.next().await {
            match event.expect("received error in websocket") {
                WebsocketEvent::Message(msg) => {
                    console_log!("{:#?}", msg);
                    let json = msg.text().expect("invalid json");
                    let message = ClientMessage::from_json(json).expect("json parse error");
                    match message {
                        ClientMessage::Event(event) => match event.verify_with_ctx(&secp) {
                            Ok(_) => {
                                let ok = RelayMessage::ok(event.id, true, "");
                                server.send_with_str(ok.as_json()).expect("send error");
                            }
                            Err(_) => {
                                let notice = RelayMessage::notice("invalid event");
                                server.send_with_str(notice.as_json()).expect("send error");
                            }
                        },
                        ClientMessage::Req {
                            subscription_id,
                            filters,
                        } => {
                            let eose = RelayMessage::eose(subscription_id);
                            server.send_with_str(eose.as_json()).expect("send error");
                        }
                        ClientMessage::Count {
                            subscription_id,
                            filters,
                        } => todo!(),
                        ClientMessage::Close(_) => todo!(),
                        ClientMessage::Auth(_) => todo!(),
                        ClientMessage::NegOpen {
                            subscription_id,
                            filter,
                            id_size,
                            initial_message,
                        } => todo!(),
                        ClientMessage::NegMsg {
                            subscription_id,
                            message,
                        } => todo!(),
                        ClientMessage::NegClose { subscription_id } => todo!(),
                    }
                }
                WebsocketEvent::Close(event) => console_log!("Closed!"),
            }
        }
    });
    Response::from_websocket(client)
}
