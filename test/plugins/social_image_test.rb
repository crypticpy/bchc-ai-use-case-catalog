# frozen_string_literal: true

# Unit tests for _plugins/social_image.rb's CatalogTemplate::SocialImage.
#
#   npm run test:ruby     (or: ruby -Itest test/plugins/social_image_test.rb)
#
# As with modules_test.rb, `jekyll` is loaded so the plugin's load-time
# `Jekyll::Hooks.register` succeeds, but the hook is never triggered here —
# the tests call `apply_default` directly against a lightweight double.
# `apply_default` only touches `site.data` and each page's `data` hash, so
# no real Jekyll::Site is built.

require "minitest/autorun"
require "jekyll"

require_relative "../../_plugins/social_image"

SocialImageFakeSite = Struct.new(:data, :pages) unless defined?(SocialImageFakeSite)
SocialImageFakePage = Struct.new(:data) unless defined?(SocialImageFakePage)

class SocialImageTest < Minitest::Test
  def build_site(og_image:, pages: [])
    data = { "site" => { "social" => { "og_image" => og_image } } }
    SocialImageFakeSite.new(data, pages)
  end

  def test_apply_default_fills_pages_that_bring_no_image
    page = SocialImageFakePage.new({})
    site = build_site(og_image: "/assets/images/illustrations/og-card.png", pages: [page])
    CatalogTemplate::SocialImage.apply_default(site)
    assert_equal "/assets/images/illustrations/og-card.png", page.data["image"]
  end

  def test_apply_default_keeps_a_pages_own_front_matter_image
    page = SocialImageFakePage.new({ "image" => "/assets/images/custom.png" })
    site = build_site(og_image: "/assets/images/illustrations/og-card.png", pages: [page])
    CatalogTemplate::SocialImage.apply_default(site)
    assert_equal "/assets/images/custom.png", page.data["image"]
  end

  def test_apply_default_is_a_noop_when_og_image_is_blank
    page = SocialImageFakePage.new({})
    site = build_site(og_image: "  ", pages: [page])
    CatalogTemplate::SocialImage.apply_default(site)
    assert_nil page.data["image"]
  end

  def test_apply_default_is_a_noop_when_the_social_block_is_absent
    page = SocialImageFakePage.new({})
    site = SocialImageFakeSite.new({ "site" => {} }, [page])
    CatalogTemplate::SocialImage.apply_default(site)
    assert_nil page.data["image"]
  end
end
