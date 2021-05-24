#!/bin/sh

rm -rf build/*
truffle migrate --reset --compile-all
rm -rf ../user-interface/src/contracts/*
cp -r build/contracts/* ../user-interface/src/contracts/