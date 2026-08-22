# frozen_string_literal: true

require "bundler"

allowed = ENV.fetch("PHCT_ALLOWED_LICENSES", "").split("\n").to_h { |license| [license, true] }
findings = []

Bundler.load.specs.sort_by(&:name).each do |spec|
  licenses = Array(spec.licenses).reject(&:empty?)
  findings << "#{spec.full_name}: missing license metadata" if licenses.empty?
  licenses.each do |license|
    findings << "#{spec.full_name}: unreviewed license #{license}" unless allowed[license]
  end
end

if findings.any?
  warn findings.join("\n")
  exit 1
end

puts "All bundled gem licenses are reviewed."
