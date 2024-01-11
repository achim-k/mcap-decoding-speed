#!/usr/bin/env python3
import argparse
from mcap.writer import Writer
from rclpy.serialization import serialize_message
from builtin_interfaces.msg import Time
from foxglove_msgs.msg import PosesInFrame, LaserScan, Log
from geometry_msgs.msg import Pose, Point, Quaternion

STATE_NAMES = ["PURPLE", "YELLOW", "PINK", "CYAN", "MAGENTA", "LIME", "GRAY"]

BUILTIN_INTERFACES_TIME_IDL = """
module builtin_interfaces {
module msg {
struct Time {
  int32 sec;
  uint32 nanosec;
};
};
};
"""

GEOMETRY_MSGS_POSE_IDL = """
module geometry_msgs {
module msg {
struct Point {
  double x;
  double y;
  double z;
};

struct Quaternion {
  @default (value=0.0)
  double x;
  @default (value=0.0)
  double y;
  @default (value=0.0)
  double z;
  @default (value=1.0)
  double w;
};

struct Pose {
  geometry_msgs::msg::Point position;
  geometry_msgs::msg::Quaternion orientation;
};
};
};
"""

FOXGLOVE_MSGS_LOG_IDL = (
    BUILTIN_INTERFACES_TIME_IDL
    + """
module foxglove_msgs {
module msg {
module Log_Constants {
  const uint8 UNKNOWN = 0;
  const uint8 DEBUG = 1;
  const uint8 INFO = 2;
  const uint8 WARNING = 3;
  const uint8 ERROR = 4;
  const uint8 FATAL = 5;
};

struct Log {
  builtin_interfaces::msg::Time timestamp;
  uint8 level;
  string message;
  string name;
  string file;
  uint32 line;
};
};
};"""
)

FOXGLOVE_MSGS_POSES_IN_FRAME_IDL = (
    BUILTIN_INTERFACES_TIME_IDL
    + GEOMETRY_MSGS_POSE_IDL
    + """
module foxglove_msgs {
module msg {
struct PosesInFrame {
  builtin_interfaces::msg::Time timestamp;
  string frame_id;
  sequence<geometry_msgs::msg::Pose> poses;
};
};
};"""
)

FOXGLOVE_MSGS_SCAN_IDL = (
    BUILTIN_INTERFACES_TIME_IDL
    + GEOMETRY_MSGS_POSE_IDL
    + """
module foxglove_msgs {
module msg {
struct LaserScan {
    builtin_interfaces::msg::Time timestamp;
    string frame_id;
    geometry_msgs::msg::Pose pose;
    double start_angle;
    double end_angle;
    sequence<double> ranges;
    sequence<double> intensities;
};
};
};
"""
)


def main(outfile, num_msgs, topic_prefix):
    with open(outfile, "wb") as f:
        mcap_writer = Writer(f)
        mcap_writer.start()

        log_schema_id = mcap_writer.register_schema(
            name="foxglove_msgs::msg::Log",
            encoding="omgidl",
            data=FOXGLOVE_MSGS_LOG_IDL.encode(),
        )
        log_channel_id = mcap_writer.register_channel(
            schema_id=log_schema_id,
            topic=topic_prefix + "/log",
            message_encoding="cdr",
        )
        poses_schema_id = mcap_writer.register_schema(
            name="foxglove_msgs::msg::PosesInFrame",
            encoding="omgidl",
            data=FOXGLOVE_MSGS_POSES_IN_FRAME_IDL.encode(),
        )
        poses_channel_id = mcap_writer.register_channel(
            schema_id=poses_schema_id,
            topic=topic_prefix + "/poses_in_frame",
            message_encoding="cdr",
        )
        scan_schema_id = mcap_writer.register_schema(
            name="foxglove_msgs::msg::LaserScan",
            encoding="omgidl",
            data=FOXGLOVE_MSGS_SCAN_IDL.encode(),
        )
        scan_channel_id = mcap_writer.register_channel(
            schema_id=scan_schema_id,
            topic=topic_prefix + "/scan",
            message_encoding="cdr",
        )

        for i in range(num_msgs):
            pub_time = log_time = i * 1_000_000
            mcap_writer.add_message(
                channel_id=log_channel_id,
                data=serialize_message(
                    Log(
                        level=i % 6,
                        message=f"Message #{i}",
                        name=STATE_NAMES[i % len(STATE_NAMES)],
                        line=i,
                    )
                ),
                log_time=log_time,
                publish_time=pub_time,
            )

            mcap_writer.add_message(
                channel_id=poses_channel_id,
                data=serialize_message(
                    PosesInFrame(
                        timestamp=Time(nsec=pub_time * 1e-9),
                        frame_id=f"poses_frame",
                        poses=[
                            Pose(
                                position=Point(x=float(i), y=float(i), z=float(i)),
                                orientation=Quaternion(x=0.0, y=0.0, z=0.0, w=1.0),
                            )
                            for _ in range(25)
                        ],
                    )
                ),
                log_time=log_time,
                publish_time=pub_time,
            )

            mcap_writer.add_message(
                channel_id=scan_channel_id,
                data=serialize_message(
                    LaserScan(
                        timestamp=Time(nsec=pub_time * 1e-9),
                        frame_id=f"laser_scan_frame",
                        pose=Pose(
                            position=Point(x=float(i), y=float(i), z=float(i)),
                            orientation=Quaternion(x=0.0, y=0.0, z=0.0, w=1.0),
                        ),
                        start_angle=0.0,
                        end_angle=0.0,
                        ranges=[float(i) for i in range(1000)],
                        intensities=[float(i) for i in range(1000)],
                    )
                ),
                log_time=log_time,
                publish_time=pub_time,
            )

        mcap_writer.finish()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("outfile", help="File to generate")
    parser.add_argument(
        "--num-msgs", help="Number of messages per topic", default=10_000, type=int
    )
    parser.add_argument("--topic-prefix", default="/omgidl", type=str)
    args = parser.parse_args()
    main(args.outfile, args.num_msgs, args.topic_prefix)
