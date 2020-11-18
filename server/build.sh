#!/bin/bash
g++ -std=c++0x -pthread  -Wall -Wcast-align  -lpthread -lrt -lboost_system -lboost_thread -lboost_random -lboost_atomic -lpthread -lboost_system  main.cpp -o server
