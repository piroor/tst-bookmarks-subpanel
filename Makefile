.PHONY: xpi

all: xpi

xpi:
	rm -f ./*.xpi
	zip -r -0 tst-bookmarks-subpanel.xpi manifest.json _locales common options background panel -x '*/.*' >/dev/null 2>/dev/null
