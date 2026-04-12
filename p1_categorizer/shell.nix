{ pkgs ? import <nixpkgs> {} }:

pkgs.mkShell {
  buildInputs = [
    pkgs.python3
    pkgs.python3Packages.flask
    pkgs.python3Packages.opencv4
    pkgs.python3Packages.pytesseract
    pkgs.python3Packages.pillow
    pkgs.python3Packages.numpy
    pkgs.python3Packages.google-api-python-client
    pkgs.python3Packages.google-auth-oauthlib
    pkgs.python3Packages.google-auth-httplib2
    pkgs.tesseract
  ];
}
