# Releasing

A version of `appkit` is a tag `vX.Y.Z` on `main`. There is no build to publish: the apps depend on
the tag, and `Cargo.lock` of each app pins its commit.

1. **`main` is green.** The CI of the very commit that gets the tag passed on Linux and Windows,
   with `cargo deny` and `cargo audit`.
2. **The version says what changed.** While the version is `0.x`, a change of anything public
   (a type, a function, a field, a route of the core, the order or the meaning of a check of the
   guard) raises the minor number (`0.1.0` to `0.2.0`); a fix that keeps all of it raises the patch
   number. The crates keep `version = "0.0.0"` in their manifests: the tag is the version.
3. **Tag and push.** `git tag -a vX.Y.Z -m "..."` on the green commit, `git push origin vX.Y.Z`.
4. **A tag is never moved or deleted.** A mistake is fixed in the next version. Each app checks in its
   CI that the commit its `Cargo.lock` pins is the one its tag names now, so a moved tag is noticed.
5. **Every app takes a fix of the guard.** A change to the guard, the pairing, the sessions or the
   limits that closes a hole is taken by every app that uses the kit, not only by the one that found
   it: the change names the apps and their tasks.
