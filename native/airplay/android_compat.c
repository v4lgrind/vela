/*
 * Bionic has no POSIX shared memory. cliairplay only uses it for the
 * optional --ptp-daemon shared clock, which the app never enables.
 */
#include <errno.h>
#include <sys/types.h>

int android_shm_open(const char *name, int flags, mode_t mode) {
    (void)name; (void)flags; (void)mode;
    errno = ENOSYS;
    return -1;
}

int android_shm_unlink(const char *name) {
    (void)name;
    errno = ENOSYS;
    return -1;
}
