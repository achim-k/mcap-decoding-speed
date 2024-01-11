#!/bin/bash

folders=("omgidl" "proto" "ros1msg" "ros2msg")

for folder in "${folders[@]}"
do
  docker build --rm -t mcap-generate-$folder $folder
  docker run -it --rm -v $PWD/$folder:/tmp mcap-generate-$folder bash -c "rm -rf /tmp/out.mcap && /tmp/generate.py /tmp/out.mcap --num-msgs ${1:-10000}"
done

mcap merge omgidl/*.mcap proto/*.mcap ros1msg/*.mcap ros2msg/**/*.mcap -o merged.mcap