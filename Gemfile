source "https://rubygems.org"

# Pin to a Ruby version compatible with React Native 0.74+ tooling and the
# current Fastlane release line. Using `~>` lets patch updates flow in.
ruby "~> 3.2"

gem "fastlane", "~> 2.222"
gem "cocoapods", "~> 1.15"

plugins_path = File.join(File.dirname(__FILE__), "fastlane", "Pluginfile")
eval_gemfile(plugins_path) if File.exist?(plugins_path)
