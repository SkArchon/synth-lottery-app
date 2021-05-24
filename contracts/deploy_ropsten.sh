#!/bin/sh

rm -rf build/*
#truffle migrate --network kovan

truffle migrate --compile-all --network ropsten

rm -rf ../user-interface/src/contracts/*
cp -r build/contracts/* ../user-interface/src/contracts/