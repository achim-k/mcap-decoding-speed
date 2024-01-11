#!/usr/bin/env python3
import argparse
from mcap_protobuf.writer import Writer
from google.protobuf.timestamp_pb2 import Timestamp
from foxglove_schemas_protobuf.Vector3_pb2 import Vector3
from foxglove_schemas_protobuf.Quaternion_pb2 import Quaternion
from foxglove_schemas_protobuf.Pose_pb2 import Pose
from foxglove_schemas_protobuf.PosesInFrame_pb2 import PosesInFrame
from foxglove_schemas_protobuf.LaserScan_pb2 import LaserScan
from foxglove_schemas_protobuf.Log_pb2 import Log

STATE_NAMES = ["PURPLE", "YELLOW", "PINK", "CYAN", "MAGENTA", "LIME", "GRAY"]


def main(outfile, num_msgs, topic_prefix):
    with open(outfile, "wb") as f, Writer(f) as mcap_writer:
        for i in range(num_msgs):
            pub_time = log_time = i * 1_000_000

            mcap_writer.write_message(
                topic=topic_prefix + "/log",
                message=Log(
                    level=i % 6,
                    message=f"Message #{i}",
                    name=STATE_NAMES[i % len(STATE_NAMES)],
                    line=i,
                ),
                log_time=log_time,
                publish_time=pub_time,
            )

            mcap_writer.write_message(
                topic=topic_prefix + "/poses_in_frame",
                message=PosesInFrame(
                    timestamp=Timestamp(seconds=i * 1_000_000),
                    frame_id=f"poses_frame",
                    poses=[
                        Pose(
                            position=Vector3(x=float(i), y=float(i), z=float(i)),
                            orientation=Quaternion(x=0.0, y=0.0, z=0.0, w=1.0),
                        )
                        for _ in range(25)
                    ],
                ),
                log_time=log_time,
                publish_time=pub_time,
            )

            mcap_writer.write_message(
                topic=topic_prefix + "/scan",
                message=LaserScan(
                    timestamp=Timestamp(seconds=i * 1_000_000),
                    frame_id=f"laser_scan_frame",
                    pose=Pose(
                        position=Vector3(x=float(i), y=float(i), z=float(i)),
                        orientation=Quaternion(x=0.0, y=0.0, z=0.0, w=1.0),
                    ),
                    start_angle=0.0,
                    end_angle=0.0,
                    ranges=[float(i) for i in range(1000)],
                    intensities=[float(i) for i in range(1000)],
                ),
                log_time=log_time,
                publish_time=pub_time,
            )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("outfile", help="File to generate")
    parser.add_argument(
        "--num-msgs", help="Number of messages per topic", default=10_000, type=int
    )
    parser.add_argument("--topic-prefix", default="/protobuf", type=str)
    args = parser.parse_args()
    main(args.outfile, args.num_msgs, args.topic_prefix)
