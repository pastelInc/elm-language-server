- Update the changelog in `CHANGELOG.md`
- Increase the version in `package.json`
- Run `npm install`
- Run `npm run compile`
- Push the code to github and wait for the CI
- Run `npm publish`
- Tag the new version on github
- Update Nix upstream ([instructions](https://github.com/turboMaCk/nixpkgs/blob/98997bb48997b27287a2995460d2fb6e1db88de7/pkgs/development/compilers/elm/packages/README.md#upgrades))