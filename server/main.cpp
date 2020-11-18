#include <set>
#include <websocketpp/config/asio_no_tls.hpp>
#include <websocketpp/server.hpp>
#include <websocketpp/frame.hpp>
#include <nlohmann/json.hpp>

using json = nlohmann::json;

typedef websocketpp::server<websocketpp::config::asio> server;

using websocketpp::connection_hdl;
using websocketpp::lib::placeholders::_1;
using websocketpp::lib::placeholders::_2;
using websocketpp::lib::bind;
using namespace websocketpp::frame;

struct video_state_t {
  std::string video_id;
  bool playing;
  uint16_t current_time;

  bool operator==(video_state_t& b){
      return video_id == b.video_id &&
        playing == b.playing &&
        current_time == b.current_time;
  }
  bool operator!=(video_state_t& b){
      return !(*this == b);
  }
};
void from_json(const json& j, video_state_t& v) {
    j.at("videoId").get_to(v.video_id);
    j.at("playing").get_to(v.playing);
    j.at("currentTime").get_to(v.current_time);
}
void to_json(json& j, const video_state_t& v) {
    j = json{\
        {"videoId", v.video_id},
        {"playing", v.playing},
        {"currentTime", v.current_time}
    };
}

enum class connection_state_t {
  CONNECTING = 0,
  CONNECTED = 1,
  DISCONNECTING = 2
};

struct client_state_t {
  std::string id;
  std::string name;
  std::string room_name;
  bool ready;
  connection_state_t connection_state;
  video_state_t video_state;

  connection_hdl connection;
};
void from_json(const json& j, client_state_t& c) {
    j.at("id").get_to(c.id);
    j.at("name").get_to(c.name);
    j.at("roomName").get_to(c.room_name);
    j.at("ready").get_to(c.ready);
    j.at("connectionState").get_to(c.connection_state);
    j.at("videoState").get_to(c.video_state);
}
void to_json(json& j, const client_state_t& c) {
    j = json{
        {"id", c.id},
        {"name", c.name},
        {"roomName", c.room_name},
        {"ready", c.ready},
        {"connectionState", c.connection_state},
        {"videoState", c.video_state}
    };
}

enum class yt_sync_ev_t {
  SET_VIDEO_STATE = 0,
  ALL_READY = 1,

  INVALID
};

class yt_sync_ev {
    const yt_sync_ev_t type = yt_sync_ev_t::INVALID;
};

struct yt_sync_set_video_state_ev: yt_sync_ev {
  const yt_sync_ev_t type = yt_sync_ev_t::SET_VIDEO_STATE;
  video_state_t video_state;
  int sync_counter;
};
void to_json(json& j, const yt_sync_set_video_state_ev& e) {
    j = json{
        {"type", e.type},
        {"videoState", e.video_state},
        {"syncCounter", e.sync_counter}
    };
}

struct yt_sync_all_ready_ev: yt_sync_ev {
  const yt_sync_ev_t type = yt_sync_ev_t::ALL_READY;
};
void to_json(json& j, const yt_sync_all_ready_ev& e) {
    j = json{
        {"type", e.type}
    };
}

struct room_t {
    std::string name;
    int ready_count;
    video_state_t synced_state;
    int sync_counter;
    std::map<std::string, client_state_t> clients; 
};

template <typename T, typename U>
inline bool equals(const std::weak_ptr<T>& t, const std::weak_ptr<U>& u){
    return !t.owner_before(u) && !u.owner_before(t);
}

template <typename T, typename U>
inline bool contains(const T& v, const U& x){
    return std::find(v.begin(), v.end(), x) != v.end();
}

class broadcast_server {
public:
    broadcast_server() {
        m_server.init_asio();

        m_server.set_open_handler(bind(&broadcast_server::on_open,this,::_1));
        m_server.set_close_handler(bind(&broadcast_server::on_close,this,::_1));
        m_server.set_message_handler(bind(&broadcast_server::on_message,this,::_1,::_2));
    }

    void on_open(connection_hdl hdl) {
        m_connections.insert(hdl);
    }

    void on_close(connection_hdl hdl) {
        m_connections.erase(hdl);
        std::string client_id = "";
        for(const auto& room : rooms){
            for(const auto& client : room.second.clients){
                if(equals(hdl, client.second.connection)){
                    client_id = client.first;
                    break;
                }
            }
            if(client_id != ""){
                break;
            }
        }
        std::vector<std::string> empty_rooms;
        for(auto& room : rooms){
            std::cout << "erased: " << room.second.clients.erase(client_id) << " in " << room.first << std::endl;
            if(!room.second.clients.size()){
                empty_rooms.push_back(room.first);
            }
        }
        for(auto empty_room : empty_rooms){
            rooms.erase(empty_room);
        }
    }

    void send_msg_to_room(room_t& room, std::string msg, std::vector<std::string> excluded_ids = {}) {
        std::cout << "send " << msg << " to room " << room.name << std::endl;
        for (auto target : room.clients) {
            if(!contains(excluded_ids, target.second.id)  && !target.second.connection.expired()){
               m_server.send(target.second.connection, msg, opcode::value::text);
            }
        }
    }

    void on_message(connection_hdl hdl, server::message_ptr msg) {
        json payload = json::parse(msg->get_payload());
        std::cout << "payload:" << std::endl;
        std::cout << std::setw(4) << payload << "\n\n";
        client_state_t msg_client;
        payload["clientState"].get_to(msg_client);
        video_state_t msg_video;
        payload["syncedVideoState"].get_to(msg_video);

        room_t& room = rooms[msg_client.room_name];
        if(room.name == ""){
            std::cout << "new room: " << msg_client.room_name << std::endl;
            room.name = msg_client.room_name;
        }
        client_state_t& client = room.clients[msg_client.id];
        if(client.id == ""){
            std::cout << "new client: " << msg_client.name << std::endl;
            client = msg_client;
            client.connection = hdl;

            if(room.clients.size() > 1){
                yt_sync_set_video_state_ev sync_state_ev;
		uint16_t synced_current_time = ~0;
            	for(auto client : room.clients){
            	    const video_state_t client_video_state = client.second.video_state;
            	    if(client_video_state.current_time < synced_current_time && client_video_state.current_time > room.synced_state.current_time){
            	        synced_current_time = client_video_state.current_time;
            	    }
		}
                if(synced_current_time == ~0){
                    synced_current_time = room.synced_state.current_time;
                }
                sync_state_ev.video_state = room.synced_state;
                sync_state_ev.video_state.current_time = synced_current_time;
                sync_state_ev.sync_counter = ++room.sync_counter;
                json json_sync_state_ev = sync_state_ev;
                send_msg_to_room(room, json_sync_state_ev.dump());
            }
        }else{
            if(client.ready != msg_client.ready) {
                if(msg_client.ready){
                    room.ready_count++;
                    if(room.ready_count == room.clients.size()){
                        json json_sync_ready_ev = yt_sync_all_ready_ev();
                        send_msg_to_room(room, json_sync_ready_ev.dump());
                    }
                }
            }
            client.ready = msg_client.ready;
            client.video_state = msg_client.video_state; //TODO assign rest
        }
        
        if(room.synced_state != msg_video && room.sync_counter == payload["syncCounter"].get<int>()){
            room.ready_count = msg_client.ready;
            room.synced_state = msg_video;
            room.sync_counter++;

            yt_sync_set_video_state_ev sync_state_ev;
            sync_state_ev.video_state = msg_video;
            sync_state_ev.sync_counter = room.sync_counter;
            json json_sync_state_ev = sync_state_ev;
            send_msg_to_room(room, json_sync_state_ev.dump());

            if(room.ready_count == room.clients.size()){
                json json_sync_ready_ev = yt_sync_all_ready_ev();
                send_msg_to_room(room, json_sync_ready_ev.dump());
            }
        }
    }

    void run(uint16_t port) {
        m_server.listen(port);
        m_server.start_accept();
        m_server.run();
    }
private:
    typedef std::set<connection_hdl,std::owner_less<connection_hdl>> con_list;

    server m_server;
    con_list m_connections;

    std::map<std::string, room_t> rooms;
};

int main() {

    broadcast_server server;
    server.run(9002);
}
