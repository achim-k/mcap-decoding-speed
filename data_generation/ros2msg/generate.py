#!/usr/bin/env python3
import argparse
import rosbag2_py
from rclpy.serialization import serialize_message
from builtin_interfaces.msg import Time
from foxglove_msgs.msg import PosesInFrame, LaserScan, Log
from geometry_msgs.msg import Pose, Point, Quaternion

STATE_NAMES = ["PURPLE", "YELLOW", "PINK", "CYAN", "MAGENTA", "LIME", "GRAY"]


def main(outfile, num_msgs, topic_prefix):
    writer = rosbag2_py.SequentialWriter()
    writer.open(
        rosbag2_py.StorageOptions(uri=outfile, storage_id="mcap"),
        rosbag2_py.ConverterOptions(
            input_serialization_format="cdr", output_serialization_format="cdr"
        ),
    )

    writer.create_topic(
        rosbag2_py.TopicMetadata(
            name=topic_prefix + "/log",
            type="foxglove_msgs/msg/Log",
            serialization_format="cdr",
        )
    )
    writer.create_topic(
        rosbag2_py.TopicMetadata(
            name=topic_prefix + "/poses_in_frame",
            type="foxglove_msgs/msg/PosesInFrame",
            serialization_format="cdr",
        )
    )
    writer.create_topic(
        rosbag2_py.TopicMetadata(
            name=topic_prefix + "/scan",
            type="foxglove_msgs/msg/LaserScan",
            serialization_format="cdr",
        )
    )

    for i in range(num_msgs):
        pub_time = log_time = i * 1_000_000

        writer.write(
            topic_prefix + "/log",
            serialize_message(
                Log(
                    level=i % 6,
                    message=f"Message #{i}",
                    name=STATE_NAMES[i % len(STATE_NAMES)],
                    line=i,
                )
            ),
            pub_time,
        )

        writer.write(
            topic_prefix + "/poses_in_frame",
            serialize_message(
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
            pub_time,
        )

        writer.write(
            topic_prefix + "/scan",
            serialize_message(
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
            pub_time,
        )

    del writer


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("outfile", help="File to generate")
    parser.add_argument(
        "--num-msgs", help="Number of messages per topic", default=10_000, type=int
    )
    parser.add_argument("--topic-prefix", default="/ros2msg", type=str)
    args = parser.parse_args()
    main(args.outfile, args.num_msgs, args.topic_prefix)
