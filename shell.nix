{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.python3
    pkgs.python3Packages.flask
    pkgs.python3Packages.pillow
    pkgs.python3Packages.pymupdf
    pkgs.python3Packages.pyyaml
    pkgs.python3Packages.google-api-python-client
    pkgs.python3Packages.google-auth-oauthlib
  ];
}
