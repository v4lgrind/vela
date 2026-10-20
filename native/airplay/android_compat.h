/* Force-included into every cliairplay source; see android_compat.c. */
#pragma once
#include <sys/types.h>

#ifdef __cplusplus
extern "C" {
#endif
int android_shm_open(const char *name, int flags, mode_t mode);
int android_shm_unlink(const char *name);
#ifdef __cplusplus
}
#endif

#define shm_open android_shm_open
#define shm_unlink android_shm_unlink
