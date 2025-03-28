#!/bin/bash

LOGS_DIR="./logs"

# Check if logs directory exists
if [ ! -d "$LOGS_DIR" ]; then
  echo "Error: Log directory does not exist at $LOGS_DIR"
  exit 1
fi

# Function to display help
show_help() {
  echo "Usage: ./logs.sh [OPTIONS] [SEARCH_TERM]"
  echo ""
  echo "Options:"
  echo "  -h, --help           Show this help message"
  echo "  -a, --all            Show all logs"
  echo "  -e, --errors         Show only error logs"
  echo "  -d, --database       Show only database logs"
  echo "  -t, --today          Show only today's logs"
  echo "  -l, --latest NUM     Show latest NUM entries (default: 20)"
  echo "  -f, --follow         Follow log updates (like tail -f)"
  echo ""
  echo "Example:"
  echo "  ./logs.sh -e -t \"connection failed\""
  echo "  (Shows today's error logs containing 'connection failed')"
}

# Default settings
SHOW_ALL=false
SHOW_ERRORS=false
SHOW_DATABASE=false
ONLY_TODAY=false
FOLLOW=false
LIMIT=20
SEARCH_TERM=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -h|--help)
      show_help
      exit 0
      ;;
    -a|--all)
      SHOW_ALL=true
      shift
      ;;
    -e|--errors)
      SHOW_ERRORS=true
      shift
      ;;
    -d|--database)
      SHOW_DATABASE=true
      shift
      ;;
    -t|--today)
      ONLY_TODAY=true
      shift
      ;;
    -f|--follow)
      FOLLOW=true
      shift
      ;;
    -l|--latest)
      LIMIT=$2
      shift 2
      ;;
    *)
      SEARCH_TERM=$1
      shift
      ;;
  esac
done

# Set logs to view based on options
files_to_view=()

TODAY=$(date +"%Y-%m-%d")

if [ "$SHOW_ALL" = true ]; then
  if [ "$ONLY_TODAY" = true ]; then
    files_to_view+=("$LOGS_DIR/application-$TODAY.log")
  else
    files_to_view+=("$LOGS_DIR/application-*.log")
  fi
elif [ "$SHOW_ERRORS" = true ]; then
  if [ "$ONLY_TODAY" = true ]; then
    files_to_view+=("$LOGS_DIR/error-$TODAY.log")
  else
    files_to_view+=("$LOGS_DIR/error-*.log")
  fi
elif [ "$SHOW_DATABASE" = true ]; then
  if [ "$ONLY_TODAY" = true ]; then
    files_to_view+=("$LOGS_DIR/database-$TODAY.log")
  else
    files_to_view+=("$LOGS_DIR/database-*.log")
  fi
else
  # Default to all logs for today
  if [ "$ONLY_TODAY" = true ]; then
    files_to_view+=("$LOGS_DIR/*-$TODAY.log")
  else
    files_to_view+=("$LOGS_DIR/*.log")
  fi
fi

# Make sure files exist
existing_files=()
for pattern in "${files_to_view[@]}"; do
  for file in $pattern; do
    if [ -f "$file" ]; then
      existing_files+=("$file")
    fi
  done
done

if [ ${#existing_files[@]} -eq 0 ]; then
  echo "No log files found matching the criteria."
  exit 1
fi

# Build command
cmd="cat"
if [ "$FOLLOW" = true ]; then
  cmd="tail -f"
fi

# Apply search filter if provided
if [ -n "$SEARCH_TERM" ]; then
  $cmd "${existing_files[@]}" | grep --color=auto "$SEARCH_TERM" | tail -n $LIMIT
else
  $cmd "${existing_files[@]}" | tail -n $LIMIT
fi 