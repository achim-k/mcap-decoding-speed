FROM ros:iron-ros-base

RUN DEBIAN_FRONTEND=noninteractive apt-get update && apt-get install -y \
  python3-pip \
  ros-$ROS_DISTRO-foxglove-msgs \
  && rm -rf /var/lib/apt/lists/*

RUN python3 -m pip install mcap mcap-ros2-support
