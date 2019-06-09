.PHONY: xpi update_extlib install_extlib

all: xpi

xpi: update_extlib install_extlib
	rm -f ./*.xpi
	zip -r -0 tst-bookmarks-subpanel.xpi manifest.json _locales common options background panel extlib -x '*/.*' >/dev/null 2>/dev/null

update_extlib:
	git submodule update --init

install_extlib:
	rm -f extlib/*.js
	cp submodules/webextensions-lib-configs/Configs.js extlib/; echo 'export default Configs;' >> extlib/Configs.js
